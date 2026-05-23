// Simulated control frequency — mirrors a real MCU timer interrupt.
const CTRL_HZ = 1000;
const CTRL_DT = 1 / CTRL_HZ;   // 0.001 s per control step

class StopError extends Error {
    constructor() { super('Simulation stopped'); this.name = 'StopError'; }
}

function lerp(a, b, t) { return a + (b - a) * t; }

class Robot {
    constructor(maze, hardware = null) {
        this.maze = maze;
        this.hw   = hardware;
        this._speed   = 5;
        this._stopped = false;
        this._motion  = null;   // current motion descriptor (replaces _anim)
        this._ctrlAccum = 0;    // accumulated simulated time for sub-stepping
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = this.maze.height - 1;
        this.angle = 0;   // logical heading: 0=N 90=E 180=S 270=W
        this.odometer    = 0;
        this.elapsedTime = 0;
        this.path = [{x: this.x, y: this.y}];

        this.visX     = this.x;
        this.visY     = this.y;
        this.visAngle = 0;

        this._gyroVelocity = 0;
        this._gyroHeading  = 0;

        if (this._motion) { this._motion.resolve?.(); this._motion = null; }
        this._ctrlAccum = 0;
        this._stopped = false;
        this.maze.explored[this.y][this.x] = true;
    }

    // ── Sensors ──────────────────────────────────────────────────────────────

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
            frontRight: wallRel(0)  || wallRel(90),
            backRight:  wallRel(90) || wallRel(180),
            backLeft:   wallRel(180)|| wallRel(270),
            frontLeft:  wallRel(270)|| wallRel(0),
            gyro: this._gyroVelocity + (Math.random() - 0.5) * 1.5,
        };
    }

    get atGoal() { return this.maze.isGoal(this.x, this.y); }
    set speed(v) { this._speed = Math.max(1, Math.min(10, v)); }
    get speed()  { return this._speed; }

    // ── Interrupt handler (simulated 1 kHz timer) ─────────────────────────────
    //
    // This method represents one hardware control-loop tick:
    //   - Updates velocity via trapezoidal profile (accel / decel phase selection)
    //   - Integrates position / heading
    //   - Signals motion-complete when the target is reached

    _controlStep() {
        if (!this._motion) { this._gyroVelocity = 0; return; }
        this.elapsedTime += CTRL_DT;
        const m = this._motion;
        if      (m.type === 'straight') this._stepStraight(m);
        else if (m.type === 'pivot')    this._stepPivot(m);
        else if (m.type === 'arc')      this._stepArc(m);
    }

    // Called every animation frame; sub-steps at CTRL_DT with simulation-speed scaling
    update(dtMs) {
        // _speed 1–10 maps to 2×–20× real-time
        const simMs = Math.min(dtMs, 50) * this._speed * 2;
        this._ctrlAccum += simMs;
        const stepMs = CTRL_DT * 1000;
        while (this._ctrlAccum >= stepMs) {
            this._controlStep();
            this._ctrlAccum -= stepMs;
            if (!this._motion) break;   // just finished — don't over-step
        }
    }

    // ── Physics: straight move ────────────────────────────────────────────────

    _stepStraight(m) {
        const remaining = m.dist1 - m.dist;
        // Braking distance at current velocity: v²/(2·a)
        const stopDist = m.vel * m.vel / (2 * m.decel);
        if (remaining <= stopDist + 1e-9) {
            m.vel = Math.max(m.vel - m.decel * CTRL_DT, 0);
        } else {
            m.vel = Math.min(m.vel + m.accel * CTRL_DT, m.vMax);
        }
        m.dist = Math.min(m.dist + m.vel * CTRL_DT, m.dist1);
        this.visX     = m.x0 + m.dx * m.dist;
        this.visY     = m.y0 + m.dy * m.dist;
        this.visAngle = m.angle;
        this._gyroVelocity = 0;
        if (m.dist >= m.dist1 - 1e-9) this._finishStraight(m);
    }

    _finishStraight(m) {
        this.x = m.toX; this.y = m.toY;
        this.visX = m.toX; this.visY = m.toY;
        this.odometer++;
        this.path.push({x: this.x, y: this.y, seg: {type: 'move'}});
        this.maze.explored[this.y][this.x] = true;
        this._finishMotion();
    }

    // ── Physics: pivot (in-place) turn ────────────────────────────────────────

    _stepPivot(m) {
        const remaining = m.totalAngle - m.angleDone;
        const stopAngle = m.omega * m.omega / (2 * m.alpha);
        if (remaining <= stopAngle + 1e-9) {
            m.omega = Math.max(m.omega - m.alpha * CTRL_DT, 0);
        } else {
            m.omega = Math.min(m.omega + m.alpha * CTRL_DT, m.maxOmega);
        }
        m.angleDone = Math.min(m.angleDone + m.omega * CTRL_DT, m.totalAngle);
        this.visAngle = m.fromAngle + m.sign * m.angleDone;
        this._gyroVelocity  = m.sign * m.omega;
        this._gyroHeading  += this._gyroVelocity * CTRL_DT;
        if (m.angleDone >= m.totalAngle - 1e-9) this._finishPivot(m);
    }

    _finishPivot(m) {
        this.angle    = m.toAngle;
        this.visAngle = m.toAngle;
        this._gyroVelocity = 0;
        this._finishMotion();
    }

    // ── Physics: smooth arc turn ──────────────────────────────────────────────
    //
    // Path: entry-straight (1−R) → quarter-circle arc (πR/2) → exit-straight (1−R)
    // The robot enters at P_in with constant velocity vArc and maintains it
    // through the arc (centripetal acceleration is handled by the geometry).
    // The entry-straight was already traversed by the preceding moveForward,
    // so pathDist is initialised to entryLen (startProgress).

    _stepArc(m) {
        m.pathDist = Math.min(m.pathDist + m.vArc * CTRL_DT, m.pathLen);
        const d = m.pathDist;
        const {entryLen: ef, arcLen: af, P_in, P_out, arcC, fromAngle, toAngle, sign, R} = m;
        const diff = m.diff;

        if (d <= ef) {
            // Entry straight (only during path-history replay; skipped live)
            const frac = ef > 0 ? d / ef : 1;
            this.visX = lerp(m.fromX, P_in[0], frac);
            this.visY = lerp(m.fromY, P_in[1], frac);
            this.visAngle = fromAngle;
            this._gyroVelocity = 0;
        } else if (d <= ef + af) {
            // Arc phase — rotate arm vector around arc centre
            const arcFrac = (d - ef) / af;
            const phi = arcFrac * Math.PI / 2;
            const ax = P_in[0] - arcC[0], ay = P_in[1] - arcC[1];
            const c = Math.cos(phi), s = Math.sin(phi);
            this.visX     = arcC[0] + ax * c - ay * sign * s;
            this.visY     = arcC[1] + ax * sign * s + ay * c;
            this.visAngle = fromAngle + diff * arcFrac;
            // ω = v/r  [rad/s] → deg/s
            this._gyroVelocity  = sign * (m.vArc / R) * (180 / Math.PI);
            this._gyroHeading  += this._gyroVelocity * CTRL_DT;
        } else {
            // Exit straight
            const el = m.pathLen - ef - af;
            const exitFrac = el > 0 ? (d - ef - af) / el : 1;
            this.visX     = lerp(P_out[0], m.toX, exitFrac);
            this.visY     = lerp(P_out[1], m.toY, exitFrac);
            this.visAngle = toAngle;
            this._gyroVelocity = 0;
        }

        if (m.pathDist >= m.pathLen - 1e-9) this._finishArc(m);
    }

    _finishArc(m) {
        this.x = m.toX; this.y = m.toY;
        this.angle    = m.toAngle;
        this.visX     = m.toX;  this.visY     = m.toY;
        this.visAngle = m.toAngle;
        this._gyroVelocity = 0;
        this.odometer++;
        this.path.push({x: this.x, y: this.y, seg: {
            type: 'arc',
            fromX: m.fromX, fromY: m.fromY, toX: m.toX, toY: m.toY,
            P_in: m.P_in, P_out: m.P_out, arcC: m.arcC,
            ev: m.ev, rv: m.rv,
            fromAngle: m.fromAngle, toAngle: m.toAngle,
            sign: m.sign, R: m.R,
            totalLen: m.pathLen,
        }});
        this.maze.explored[this.y][this.x] = true;
        // Mark the turning cell (current cell) explored too
        const DX = [0,1,0,-1], DY = [-1,0,1,0];
        const fdi = ((Math.round(m.fromAngle / 90)) % 4 + 4) % 4;
        const tx = m.fromX + DX[fdi], ty = m.fromY + DY[fdi];
        if (ty >= 0 && ty < this.maze.height && tx >= 0 && tx < this.maze.width)
            this.maze.explored[ty][tx] = true;
        this._finishMotion();
    }

    // ── Arc geometry builder ─────────────────────────────────────────────────

    _buildArcMotion(fromAngle, toAngle, sign) {
        const DX = [0,1,0,-1], DY = [-1,0,1,0], DIRS = ['n','e','s','w'];
        const fromDi = ((Math.round(fromAngle / 90)) % 4 + 4) % 4;
        const toDi   = ((Math.round(toAngle  / 90)) % 4 + 4) % 4;
        const nx = this.x + DX[toDi], ny = this.y + DY[toDi];
        if (nx < 0 || nx >= this.maze.width  || ny < 0 || ny >= this.maze.height) return null;
        if (this.maze.hasWall(this.x, this.y, DIRS[toDi])) return null;

        const hw = this.hw;
        const R  = hw ? Math.min(hw.smoothRadius / hw.cellSize, 0.45) : 0.25;
        const r_m    = hw ? Math.min(hw.smoothRadius, hw.cellSize * 0.45) : 0.045;
        const vTurn  = hw ? Math.min(Math.sqrt(9.8 * r_m), hw.maxSpeed) : 0.5;
        const vArc   = hw ? vTurn / hw.cellSize : 2.0;  // cells/s

        const vec = (a) => { const r = (a - 90) * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };
        const ev = vec(fromAngle), rv = vec(toAngle);
        const diff = ((toAngle - fromAngle + 540) % 360) - 180;

        const prevX = this.x - DX[fromDi], prevY = this.y - DY[fromDi];
        const P_in  = [prevX + ev[0] * (1 - R), prevY + ev[1] * (1 - R)];
        const arcCx = P_in[0] + sign * (-ev[1]) * R;
        const arcCy = P_in[1] + sign * ( ev[0]) * R;
        const arm0x = P_in[0] - arcCx, arm0y = P_in[1] - arcCy;
        const P_out = [arcCx - sign * arm0y, arcCy + sign * arm0x];

        const entryLen = 1 - R;
        const arcLen   = Math.PI * R / 2;
        const exitLen  = 1 - R;
        const pathLen  = entryLen + arcLen + exitLen;

        return {
            type: 'arc',
            fromX: prevX, fromY: prevY, toX: nx, toY: ny,
            P_in, P_out, arcC: [arcCx, arcCy],
            ev, rv, fromAngle, toAngle, diff, sign, R,
            entryLen, arcLen, exitLen, pathLen,
            totalLen: pathLen,  // alias for _arcSample compatibility
            vArc,
            // Skip entry straight (already traversed by preceding moveForward)
            pathDist: entryLen,
        };
    }

    // ── Public motion API ─────────────────────────────────────────────────────

    async moveForward(cells = 1) {
        for (let i = 0; i < cells; i++) {
            if (this._stopped) throw new StopError();
            if (this.sensors.front) return false;
            const DX = [0,1,0,-1], DY = [-1,0,1,0];
            const di  = ((Math.round(this.angle / 90)) % 4 + 4) % 4;
            const toX = this.x + DX[di], toY = this.y + DY[di];
            const hw  = this.hw;
            await this._startMotion({
                type: 'straight',
                x0: this.x, y0: this.y, toX, toY,
                dx: DX[di], dy: DY[di], angle: this.angle,
                dist: 0, dist1: 1.0, vel: 0,
                vMax:  hw ? hw.maxSpeed / hw.cellSize : 3.0,
                accel: hw ? hw.accel   / hw.cellSize : 9.0,
                decel: hw ? hw.decel   / hw.cellSize : 9.0,
            });
            // x, y, odometer already updated by _finishStraight
        }
        return true;
    }

    async turnLeft(deg = 90) {
        if (this._stopped) throw new StopError();
        const hw = this.hw;
        await this._startMotion({
            type: 'pivot',
            fromAngle: this.visAngle,
            toAngle:   ((this.angle - deg) + 360) % 360,
            sign: -1, totalAngle: deg, angleDone: 0, omega: 0,
            maxOmega: hw ? hw.maxOmega   : 360,
            alpha:    hw ? hw.alphaOmega : 720,
        });
        // angle updated by _finishPivot
    }

    async turnRight(deg = 90) {
        if (this._stopped) throw new StopError();
        const hw = this.hw;
        await this._startMotion({
            type: 'pivot',
            fromAngle: this.visAngle,
            toAngle:   (this.angle + deg) % 360,
            sign: +1, totalAngle: deg, angleDone: 0, omega: 0,
            maxOmega: hw ? hw.maxOmega   : 360,
            alpha:    hw ? hw.alphaOmega : 720,
        });
    }

    async smoothTurnRight() {
        if (this._stopped) throw new StopError();
        const m = this._buildArcMotion(this.angle, (this.angle + 90) % 360, +1);
        if (!m) return false;
        await this._startMotion(m);
        return true;
    }

    async smoothTurnLeft() {
        if (this._stopped) throw new StopError();
        const m = this._buildArcMotion(this.angle, ((this.angle - 90) + 360) % 360, -1);
        if (!m) return false;
        await this._startMotion(m);
        return true;
    }

    async moveTo(worldDir) {
        if (this._stopped) throw new StopError();
        const targetAngle = {n:0, e:90, s:180, w:270}[worldDir];
        const diff = ((targetAngle - this.angle) + 360) % 360;
        if (this.hw && this.hw.turnType === 'smooth') {
            if (diff === 0)   return await this.moveForward();
            if (diff === 90)  {
                if (await this.smoothTurnRight()) return true;
                await this.turnRight(); return await this.moveForward();
            }
            if (diff === 270) {
                if (await this.smoothTurnLeft()) return true;
                await this.turnLeft();  return await this.moveForward();
            }
            await this.turnRight(180);
            return await this.moveForward();
        } else {
            if (diff === 90)       await this.turnRight();
            else if (diff === 270) await this.turnLeft();
            else if (diff === 180) await this.turnRight(180);
            return await this.moveForward();
        }
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    _startMotion(m) {
        return new Promise(resolve => {
            this._motion = {...m, resolve};
        });
    }

    _finishMotion() {
        const resolve = this._motion?.resolve;
        this._motion = null;
        this._ctrlAccum = 0;  // discard any sub-step overshoot
        resolve?.();
    }

    stop() {
        this._stopped = true;
        if (this._motion) { const r = this._motion.resolve; this._motion = null; r(); }
    }
    resume() { this._stopped = false; }
}
