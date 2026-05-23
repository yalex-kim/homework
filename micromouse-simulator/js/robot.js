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
        this._motion  = null;
        this._ctrlAccum = 0;
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = this.maze.height - 1;
        this.angle = 0;   // logical heading: 0=N 90=E 180=S 270=W
        this.odometer    = 0;
        this.elapsedTime = 0;

        this.visX     = this.x;
        this.visY     = this.y;
        this.visAngle = 0;

        // _atBoundary: false = at cell centre, true = at cell-entry boundary
        // Sensing always happens while _atBoundary is true.
        this._atBoundary = false;

        this.path = [{x: this.x, y: this.y, visX: this.visX, visY: this.visY}];

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

    _controlStep() {
        if (!this._motion) { this._gyroVelocity = 0; return; }
        this.elapsedTime += CTRL_DT;
        const m = this._motion;
        if      (m.type === 'straight') this._stepStraight(m);
        else if (m.type === 'pivot')    this._stepPivot(m);
        else if (m.type === 'arc')      this._stepArc(m);
    }

    update(dtMs) {
        const simMs = Math.min(dtMs, 50) * this._speed * 2;
        this._ctrlAccum += simMs;
        const stepMs = CTRL_DT * 1000;
        while (this._ctrlAccum >= stepMs) {
            this._controlStep();
            this._ctrlAccum -= stepMs;
            if (!this._motion) break;
        }
    }

    // ── Physics: straight move ────────────────────────────────────────────────

    _stepStraight(m) {
        const remaining = m.dist1 - m.dist;
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
        this.visX = m.x0 + m.dx * m.dist1;
        this.visY = m.y0 + m.dy * m.dist1;

        if (m.toCenter) {
            // Half-step to cell centre before a pivot: no path entry, no odometer
            this._atBoundary = false;
        } else {
            // Normal boundary arrival
            this._atBoundary = true;
            this.odometer++;
            this.path.push({
                x: this.x, y: this.y,
                visX: this.visX, visY: this.visY,
                seg: {type: 'move'},
            });
            this.maze.explored[this.y][this.x] = true;
        }
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
    // Two arc modes:
    //   Centre arc (legacy):  entry-straight (1−R) + quarter-circle (πR/2) + exit-straight (1−R)
    //   Boundary arc (new):   quarter-circle only (πR/2), R=0.5 cell
    //     Start = cell-entry boundary, end = cell-exit boundary.
    //     pathDist starts at 0 (no skip).

    _stepArc(m) {
        m.pathDist = Math.min(m.pathDist + m.vArc * CTRL_DT, m.pathLen);
        const d = m.pathDist;
        const {entryLen: ef, arcLen: af, P_in, P_out, arcC, fromAngle, toAngle, sign, R} = m;
        const diff = m.diff;

        if (d <= ef) {
            // Entry straight
            const frac = ef > 0 ? d / ef : 1;
            this.visX = lerp(m.fromX, P_in[0], frac);
            this.visY = lerp(m.fromY, P_in[1], frac);
            this.visAngle = fromAngle;
            this._gyroVelocity = 0;
        } else if (d <= ef + af) {
            // Arc phase
            const arcFrac = (d - ef) / af;
            const phi = arcFrac * Math.PI / 2;
            const ax = P_in[0] - arcC[0], ay = P_in[1] - arcC[1];
            const c = Math.cos(phi), s = Math.sin(phi);
            this.visX     = arcC[0] + ax * c - ay * sign * s;
            this.visY     = arcC[1] + ax * sign * s + ay * c;
            this.visAngle = fromAngle + diff * arcFrac;
            this._gyroVelocity  = sign * (m.vArc / R) * (180 / Math.PI);
            this._gyroHeading  += this._gyroVelocity * CTRL_DT;
        } else {
            // Exit straight
            const el = m.pathLen - ef - af;
            const exitFrac = el > 0 ? (d - ef - af) / el : 1;
            this.visX     = lerp(P_out[0], m.visToX, exitFrac);
            this.visY     = lerp(P_out[1], m.visToY, exitFrac);
            this.visAngle = toAngle;
            this._gyroVelocity = 0;
        }

        if (m.pathDist >= m.pathLen - 1e-9) this._finishArc(m);
    }

    _finishArc(m) {
        this.x = m.toX; this.y = m.toY;
        this.angle    = m.toAngle;
        this.visX     = m.visToX;
        this.visY     = m.visToY;
        this.visAngle = m.toAngle;
        this._gyroVelocity = 0;
        this._atBoundary = true;
        this.odometer++;
        this.path.push({
            x: this.x, y: this.y,
            visX: this.visX, visY: this.visY,
            seg: {
                type: 'arc',
                fromX: m.fromX, fromY: m.fromY,
                toX: m.visToX,  toY: m.visToY,   // visual endpoints for renderer
                P_in: m.P_in, P_out: m.P_out, arcC: m.arcC,
                ev: m.ev, rv: m.rv,
                fromAngle: m.fromAngle, toAngle: m.toAngle,
                sign: m.sign, R: m.R,
                entryLen: m.entryLen, arcLen: m.arcLen, exitLen: m.exitLen,
                totalLen: m.pathLen,
            },
        });
        this.maze.explored[this.y][this.x] = true;
        // Also mark the cell the robot was turning through
        const DX = [0,1,0,-1], DY = [-1,0,1,0];
        const fromLogX = m.fromLogX, fromLogY = m.fromLogY;
        if (fromLogX != null &&
            fromLogY >= 0 && fromLogY < this.maze.height &&
            fromLogX >= 0 && fromLogX < this.maze.width) {
            this.maze.explored[fromLogY][fromLogX] = true;
        }
        this._finishMotion();
    }

    // ── Arc geometry builders ─────────────────────────────────────────────────

    // Centre-arc: entry-straight (1−R) + arc + exit-straight.
    // Used when robot is at a cell centre (very first move, rare).
    _buildCentreArc(fromAngle, toAngle, sign) {
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
        const vArc   = hw ? vTurn / hw.cellSize : 2.0;

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
            visToX: nx, visToY: ny,         // centre arc ends at integer cell centre
            fromLogX: this.x, fromLogY: this.y,
            P_in, P_out, arcC: [arcCx, arcCy],
            ev, rv, fromAngle, toAngle, diff, sign, R,
            entryLen, arcLen, exitLen, pathLen, totalLen: pathLen,
            vArc,
            pathDist: entryLen,             // skip entry straight (already traversed)
        };
    }

    // Boundary-arc: pure quarter-circle R=0.5, starts and ends at cell boundaries.
    // Robot must be at a cell-entry boundary (_atBoundary = true).
    _buildBoundaryArc(fromAngle, toAngle, sign) {
        const DX = [0,1,0,-1], DY = [-1,0,1,0], DIRS = ['n','e','s','w'];
        const toDi = ((Math.round(toAngle / 90)) % 4 + 4) % 4;
        const nx = this.x + DX[toDi], ny = this.y + DY[toDi];
        if (nx < 0 || nx >= this.maze.width || ny < 0 || ny >= this.maze.height) return null;
        if (this.maze.hasWall(this.x, this.y, DIRS[toDi])) return null;

        const hw = this.hw;
        const r_m   = hw ? Math.min(hw.smoothRadius, hw.cellSize * 0.45) : 0.045;
        const vTurn = hw ? Math.min(Math.sqrt(9.8 * r_m), hw.maxSpeed) : 0.5;
        const vArc  = hw ? vTurn / hw.cellSize : 2.0;

        const vec = (a) => { const r = (a - 90) * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };
        const ev = vec(fromAngle), rv = vec(toAngle);
        const diff = ((toAngle - fromAngle + 540) % 360) - 180;

        const R = 0.5;
        const P_in  = [this.visX, this.visY];
        const arcCx = P_in[0] + sign * (-ev[1]) * R;
        const arcCy = P_in[1] + sign * ( ev[0]) * R;
        const arm0x = P_in[0] - arcCx, arm0y = P_in[1] - arcCy;
        const P_out = [arcCx - sign * arm0y, arcCy + sign * arm0x];

        const arcLen = Math.PI * R / 2;   // π/4 cell-units

        return {
            type: 'arc',
            fromX: P_in[0], fromY: P_in[1], toX: nx, toY: ny,
            visToX: P_out[0], visToY: P_out[1],  // boundary arc ends at P_out
            fromLogX: this.x, fromLogY: this.y,
            P_in, P_out, arcC: [arcCx, arcCy],
            ev, rv, fromAngle, toAngle, diff, sign, R,
            entryLen: 0, arcLen, exitLen: 0, pathLen: arcLen, totalLen: arcLen,
            vArc,
            pathDist: 0,
        };
    }

    // ── Public motion API ─────────────────────────────────────────────────────

    // Move forward.
    //   From cell centre  (_atBoundary=false): advance 0.5 cells → cell-entry boundary.
    //   From cell boundary (_atBoundary=true) : advance 1.0 cells → next cell-entry boundary.
    // Logical (x,y) is updated at the boundary; sensors at that point see the new cell.
    async moveForward(cells = 1) {
        for (let i = 0; i < cells; i++) {
            if (this._stopped) throw new StopError();
            if (this.sensors.front) return false;
            const DX = [0,1,0,-1], DY = [-1,0,1,0];
            const di  = ((Math.round(this.angle / 90)) % 4 + 4) % 4;
            const toX = this.x + DX[di], toY = this.y + DY[di];
            const hw  = this.hw;
            const dist1 = this._atBoundary ? 1.0 : 0.5;
            await this._startMotion({
                type: 'straight',
                x0: this.visX, y0: this.visY, toX, toY,
                dx: DX[di], dy: DY[di], angle: this.angle,
                dist: 0, dist1, vel: 0,
                vMax:  hw ? hw.maxSpeed / hw.cellSize : 3.0,
                accel: hw ? hw.accel   / hw.cellSize : 9.0,
                decel: hw ? hw.decel   / hw.cellSize : 9.0,
            });
        }
        return true;
    }

    // Advance 0.5 cells to cell centre (used before a pivot when _atBoundary=true).
    async _advanceToCenter() {
        const DX = [0,1,0,-1], DY = [-1,0,1,0];
        const di = ((Math.round(this.angle / 90)) % 4 + 4) % 4;
        const hw = this.hw;
        await this._startMotion({
            type: 'straight',
            x0: this.visX, y0: this.visY, toX: this.x, toY: this.y,
            dx: DX[di], dy: DY[di], angle: this.angle,
            dist: 0, dist1: 0.5, vel: 0,
            vMax:  hw ? hw.maxSpeed / hw.cellSize : 3.0,
            accel: hw ? hw.accel   / hw.cellSize : 9.0,
            decel: hw ? hw.decel   / hw.cellSize : 9.0,
            toCenter: true,   // suppresses path-history entry; sets _atBoundary=false
        });
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
        // this.angle set by _finishPivot
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
        // this.angle set by _finishPivot
    }

    async smoothTurnRight() {
        if (this._stopped) throw new StopError();
        const newAngle = (this.angle + 90) % 360;
        const m = this._atBoundary
            ? this._buildBoundaryArc(this.angle, newAngle, +1)
            : this._buildCentreArc(this.angle, newAngle, +1);
        if (!m) return false;
        await this._startMotion(m);
        return true;
    }

    async smoothTurnLeft() {
        if (this._stopped) throw new StopError();
        const newAngle = ((this.angle - 90) + 360) % 360;
        const m = this._atBoundary
            ? this._buildBoundaryArc(this.angle, newAngle, -1)
            : this._buildCentreArc(this.angle, newAngle, -1);
        if (!m) return false;
        await this._startMotion(m);
        return true;
    }

    async moveTo(worldDir) {
        if (this._stopped) throw new StopError();
        const targetAngle = {n:0, e:90, s:180, w:270}[worldDir];
        const diff = ((targetAngle - this.angle) + 360) % 360;
        const hw = this.hw;

        if (hw && hw.turnType === 'smooth') {
            if (diff === 0) return await this.moveForward();

            if (diff === 90 || diff === 270) {
                const sign     = diff === 90 ? +1 : -1;
                const newAngle = (this.angle + (diff === 90 ? 90 : -90) + 360) % 360;
                const m = this._atBoundary
                    ? this._buildBoundaryArc(this.angle, newAngle, sign)
                    : this._buildCentreArc(this.angle, newAngle, sign);
                if (m) { await this._startMotion(m); return true; }
                // Arc blocked by wall — fall through to pivot
                if (this._atBoundary) await this._advanceToCenter();
                if (diff === 90) await this.turnRight(); else await this.turnLeft();
                return await this.moveForward();
            }

            // U-turn: pivot works correctly from both centre and boundary
            await this.turnRight(180);
            return await this.moveForward();

        } else {
            // Pivot mode — 90° turns need to be at cell centre for correct geometry
            if (this._atBoundary && diff !== 0 && diff !== 180) {
                await this._advanceToCenter();
            }
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
        this._ctrlAccum = 0;
        resolve?.();
    }

    stop() {
        this._stopped = true;
        if (this._motion) { const r = this._motion.resolve; this._motion = null; r(); }
    }
    resume() { this._stopped = false; }
}
