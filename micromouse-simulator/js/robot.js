class StopError extends Error {
    constructor() { super('Simulation stopped'); this.name = 'StopError'; }
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Cubic bezier point
function bezierPt(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return [
        mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0],
        mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1],
    ];
}

class Robot {
    constructor(maze, hardware = null) {
        this.maze = maze;
        this.hw   = hardware;
        this._speed   = 5;
        this._stopped = false;
        this._anim    = null;
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = this.maze.height - 1;
        this.angle = 0;   // 0=North, 90=East, 180=South, 270=West
        this.odometer = 0;
        this.elapsedTime = 0;  // physical seconds
        this.path = [{x: this.x, y: this.y}];

        // Visual (animated) state — renderer reads these
        this.visX = this.x;
        this.visY = this.y;
        this.visAngle = 0;

        // Gyro state
        this._gyroVelocity = 0;
        this._gyroHeading  = 0;

        if (this._anim) { this._anim.resolve(); this._anim = null; }
        this._stopped = false;
        this.maze.explored[this.y][this.x] = true;
    }

    // ── Sensors ─────────────────────────────────────────────────────────────

    get sensors() {
        const { x, y, angle, maze } = this;
        const DIRS = ['n', 'e', 's', 'w'];

        const wallRel = (relDeg) => {
            const idx = ((Math.round(angle / 90) + Math.round(relDeg / 90)) % 4 + 4) % 4;
            return maze.hasWall(x, y, DIRS[idx]);
        };

        return {
            front:      wallRel(0),
            right:      wallRel(90),
            back:       wallRel(180),
            left:       wallRel(270),
            frontRight: wallRel(0)   || wallRel(90),
            backRight:  wallRel(90)  || wallRel(180),
            backLeft:   wallRel(180) || wallRel(270),
            frontLeft:  wallRel(270) || wallRel(0),
            gyro: this._gyroVelocity + (Math.random() - 0.5) * 1.5,
        };
    }

    get atGoal() { return this.maze.isGoal(this.x, this.y); }

    set speed(v) { this._speed = Math.max(1, Math.min(10, v)); }
    get speed()  { return this._speed; }

    // ── Animation durations (ms) ─────────────────────────────────────────────

    get _baseMs() { return (11 - this._speed) * 40; }  // 40–400 ms

    get _moveDuration() { return this._baseMs; }

    get _turnDuration() {
        return this.hw
            ? this._baseMs * Math.min(this.hw.pivotRatio, 4)
            : this._baseMs;
    }

    get _smoothDuration() {
        return this.hw
            ? this._baseMs * Math.max(this.hw.smoothRatio, 0.08)
            : this._baseMs * 0.5;
    }

    // ── Basic actions ────────────────────────────────────────────────────────

    async moveForward(cells = 1) {
        for (let i = 0; i < cells; i++) {
            if (this._stopped) throw new StopError();
            if (this.sensors.front) return false;

            const di = Math.round(this.angle / 90) % 4;
            const nx = this.x + [0, 1, 0, -1][di];
            const ny = this.y + [-1, 0, 1, 0][di];
            const phys = this.hw ? this.hw.straightCellTime() : 0.1;

            await this._startAnim({
                type: 'move',
                fromX: this.x, fromY: this.y, toX: nx, toY: ny,
                duration: this._moveDuration, physTime: phys,
            });

            this.x = nx; this.y = ny;
            this.odometer++;
            this.path.push({x: this.x, y: this.y, seg: {type: 'move'}});
            this.maze.explored[this.y][this.x] = true;
        }
        return true;
    }

    async turnLeft(deg = 90) {
        if (this._stopped) throw new StopError();
        const phys = this.hw ? this.hw.pivotTurnTime(deg) : 0.1;
        await this._startAnim({
            type: 'turn',
            fromAngle: this.visAngle, toAngle: this.visAngle - deg,
            duration: this._turnDuration * (deg / 90), physTime: phys,
        });
        this.angle = ((this.angle - deg) % 360 + 360) % 360;
    }

    async turnRight(deg = 90) {
        if (this._stopped) throw new StopError();
        const phys = this.hw ? this.hw.pivotTurnTime(deg) : 0.1;
        await this._startAnim({
            type: 'turn',
            fromAngle: this.visAngle, toAngle: this.visAngle + deg,
            duration: this._turnDuration * (deg / 90), physTime: phys,
        });
        this.angle = (this.angle + deg) % 360;
    }

    // ── Smooth arc turn + advance ─────────────────────────────────────────────
    // Geometry: entry straight (1-R) + quarter-circle arc + exit straight (1-R)
    // Destination is diagonal: forward one cell + lateral one cell.

    _arcAnim(fromAngle, toAngle, sign) {
        const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
        const DIRS = ['n', 'e', 's', 'w'];
        const fromDi = ((Math.round(fromAngle / 90)) % 4 + 4) % 4;
        const toDi   = ((Math.round(toAngle  / 90)) % 4 + 4) % 4;

        // Diagonal destination: forward + lateral
        const nx = this.x + DX[fromDi] + DX[toDi];
        const ny = this.y + DY[fromDi] + DY[toDi];

        // Turning cell (one step forward)
        const tx = this.x + DX[fromDi];
        const ty = this.y + DY[fromDi];

        // Wall checks: forward must be clear (to enter turning cell),
        // and lateral must be clear from current cell (matches flood fill's assumption).
        if (tx < 0 || tx >= this.maze.width  || ty < 0 || ty >= this.maze.height) return null;
        if (nx < 0 || nx >= this.maze.width  || ny < 0 || ny >= this.maze.height) return null;
        if (this.maze.hasWall(this.x, this.y, DIRS[fromDi])) return null;  // forward
        if (this.maze.hasWall(this.x, this.y, DIRS[toDi]))   return null;  // lateral

        const R = this.hw
            ? Math.min(this.hw.smoothRadius / this.hw.cellSize, 0.45)
            : 0.25;

        // Heading unit vectors (screen y-down: angle 0=North→(0,-1), 90=East→(1,0))
        const vec = (a) => {
            const r = (a - 90) * Math.PI / 180;
            return [Math.cos(r), Math.sin(r)];
        };
        const ev = vec(fromAngle);
        const rv = vec(toAngle);

        // Arc geometry
        const P_in  = [this.x + ev[0]*(1-R), this.y + ev[1]*(1-R)];
        // Arc center is R to the right (sign=+1) or left (sign=-1) of heading
        const arcCx = P_in[0] + sign*(-ev[1])*R;
        const arcCy = P_in[1] + sign*( ev[0])*R;
        // P_out: rotate arm0 = (P_in - arcC) by 90° (exact)
        const arm0x = P_in[0] - arcCx, arm0y = P_in[1] - arcCy;
        const P_out = [arcCx - sign * arm0y, arcCy + sign * arm0x];

        const totalLen = 2*(1-R) + Math.PI*R/2;

        return {
            type: 'arc',
            fromX: this.x, fromY: this.y, toX: nx, toY: ny,
            P_in, P_out, arcC: [arcCx, arcCy],
            ev, rv, fromAngle, toAngle, sign, R, totalLen,
            duration: this._smoothDuration,
            physTime: this.hw ? this.hw.smoothTurnTime() : 0.1,
        };
    }

    _finishArcTurn(anim, fromAngle) {
        this.x = anim.toX; this.y = anim.toY;
        this.angle = anim.toAngle;
        this.odometer++;
        this.path.push({x: this.x, y: this.y, seg: {...anim}});
        this.maze.explored[this.y][this.x] = true;
        // Mark turning cell explored too
        const DX=[0,1,0,-1], DY=[-1,0,1,0];
        const fromDi = ((Math.round(fromAngle/90))%4+4)%4;
        const tcell = this.maze.explored[anim.fromY + DY[fromDi]];
        if (tcell) tcell[anim.fromX + DX[fromDi]] = true;
    }

    async smoothTurnRight() {
        if (this._stopped) throw new StopError();
        const fromAngle = this.angle;
        const anim = this._arcAnim(fromAngle, (fromAngle + 90) % 360, +1);
        if (!anim) return false;
        await this._startAnim(anim);
        this._finishArcTurn(anim, fromAngle);
        return true;
    }

    async smoothTurnLeft() {
        if (this._stopped) throw new StopError();
        const fromAngle = this.angle;
        const anim = this._arcAnim(fromAngle, ((fromAngle - 90) + 360) % 360, -1);
        if (!anim) return false;
        await this._startAnim(anim);
        this._finishArcTurn(anim, fromAngle);
        return true;
    }

    // High-level: move toward worldDir ('n'|'e'|'s'|'w'), auto-selecting turn type.
    async moveTo(worldDir) {
        if (this._stopped) throw new StopError();
        const targetAngle = {n:0, e:90, s:180, w:270}[worldDir];
        const diff = ((targetAngle - this.angle) + 360) % 360;

        if (this.hw && this.hw.turnType === 'smooth') {
            if (diff === 0)   return await this.moveForward();
            if (diff === 90)  {
                if (await this.smoothTurnRight()) return true;
                // wall blocks smooth arc → pivot fallback
                await this.turnRight(); return await this.moveForward();
            }
            if (diff === 270) {
                if (await this.smoothTurnLeft()) return true;
                await this.turnLeft();  return await this.moveForward();
            }
            // 180°: no smooth U-turn — fall back to pivot + move
            await this.turnRight(180);
            return await this.moveForward();
        } else {
            if (diff === 90)       await this.turnRight();
            else if (diff === 270) await this.turnLeft();
            else if (diff === 180) await this.turnRight(180);
            return await this.moveForward();
        }
    }

    // ── Bezier control points ─────────────────────────────────────────────────

    // Cubic Hermite via bezier. Tension 0.55 ≈ best circular-arc approximation.
    _bezierCP(fromX, fromY, fromAngle, toX, toY, toAngle) {
        const T = 0.55;
        const vec = (a) => {
            const r = (a - 90) * Math.PI / 180;  // world angle → canvas direction
            return [Math.cos(r), Math.sin(r)];
        };
        const [ex, ey] = vec(fromAngle);
        const [ox, oy] = vec(toAngle);
        return [
            [fromX,          fromY         ],
            [fromX + ex * T, fromY + ey * T],
            [toX   - ox * T, toY   - oy * T],
            [toX,            toY            ],
        ];
    }

    // ── Animation core ───────────────────────────────────────────────────────

    _startAnim(anim) {
        return new Promise((resolve) => {
            this._anim = {...anim, progress: 0, resolve};
        });
    }

    // Called every frame by the simulator loop with dt in ms
    update(dt) {
        if (!this._anim) { this._gyroVelocity = 0; return; }

        this._anim.progress = Math.min(this._anim.progress + dt / this._anim.duration, 1);
        const t = easeInOut(this._anim.progress);

        if (this._anim.type === 'move') {
            this.visX = lerp(this._anim.fromX, this._anim.toX, t);
            this.visY = lerp(this._anim.fromY, this._anim.toY, t);
            this._gyroVelocity = 0;

        } else if (this._anim.type === 'turn') {
            this.visAngle = lerp(this._anim.fromAngle, this._anim.toAngle, t);
            const totalDeg = this._anim.toAngle - this._anim.fromAngle;
            const deriv = this._anim.progress < 0.5
                ? 4 * this._anim.progress : 4 * (1 - this._anim.progress);
            this._gyroVelocity  = (totalDeg / (this._anim.duration / 1000)) * deriv;
            this._gyroHeading  += this._gyroVelocity * (dt / 1000);

        } else if (this._anim.type === 'bezier') {
            const { cp, fromAngle, toAngle } = this._anim;
            [this.visX, this.visY] = bezierPt(cp[0], cp[1], cp[2], cp[3], t);

            const diff = ((toAngle - fromAngle + 540) % 360) - 180;
            this.visAngle = fromAngle + diff * t;

            const deriv = this._anim.progress < 0.5
                ? 4 * this._anim.progress : 4 * (1 - this._anim.progress);
            this._gyroVelocity  = (diff / (this._anim.duration / 1000)) * deriv;
            this._gyroHeading  += this._gyroVelocity * (dt / 1000);

        } else if (this._anim.type === 'arc') {
            const { fromX, fromY, P_in, P_out, arcC, ev, rv,
                    fromAngle, toAngle, sign, R, totalLen } = this._anim;
            const diff = ((toAngle - fromAngle + 540) % 360) - 180;
            const ef = (1 - R) / totalLen;
            const af = (Math.PI * R / 2) / totalLen;

            // Use linear t for constant-speed motion through geometry
            const pathT = t;

            if (pathT <= ef) {
                const frac = ef > 0 ? pathT / ef : 1;
                this.visX = lerp(fromX, P_in[0], frac);
                this.visY = lerp(fromY, P_in[1], frac);
                this.visAngle = fromAngle;
                this._gyroVelocity = 0;

            } else if (pathT <= ef + af) {
                const arcFrac = af > 0 ? (pathT - ef) / af : 1;
                const phi = arcFrac * Math.PI / 2;
                // Rotate initial arm (P_in - arcC) clockwise (sign=+1) or CCW (sign=-1)
                const arm0x = P_in[0] - arcC[0];
                const arm0y = P_in[1] - arcC[1];
                const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
                this.visX = arcC[0] + arm0x * cosPhi - arm0y * sign * sinPhi;
                this.visY = arcC[1] + arm0x * sign * sinPhi + arm0y * cosPhi;
                this.visAngle = fromAngle + diff * arcFrac;

                const deriv = this._anim.progress < 0.5
                    ? 4 * this._anim.progress : 4 * (1 - this._anim.progress);
                this._gyroVelocity  = (diff / (this._anim.duration / 1000)) * deriv;
                this._gyroHeading  += this._gyroVelocity * (dt / 1000);

            } else {
                const exitFrac = (1 - ef - af) > 0 ? (pathT - ef - af) / (1 - ef - af) : 1;
                this.visX = lerp(P_out[0], this._anim.toX, exitFrac);
                this.visY = lerp(P_out[1], this._anim.toY, exitFrac);
                this.visAngle = toAngle;
                this._gyroVelocity = 0;
            }
        }

        if (this._anim.progress >= 1) {
            this.elapsedTime += this._anim.physTime;
            this._gyroVelocity = 0;
            const resolve = this._anim.resolve;
            this._anim = null;
            resolve();
        }
    }

    stop() {
        this._stopped = true;
        if (this._anim) { const r = this._anim.resolve; this._anim = null; r(); }
    }
    resume() { this._stopped = false; }
}
