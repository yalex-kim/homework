class StopError extends Error {
    constructor() { super('Simulation stopped'); this.name = 'StopError'; }
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

class Robot {
    constructor(maze) {
        this.maze = maze;
        this._speed = 5;
        this._stopped = false;
        this._anim = null;
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = this.maze.height - 1;
        this.angle = 0;   // 0=North, 90=East, 180=South, 270=West
        this.odometer = 0;
        this.path = [{ x: this.x, y: this.y }];

        // Visual (animation) state — renderer uses these
        this.visX = this.x;
        this.visY = this.y;
        this.visAngle = 0;

        // Gyro state
        this._gyroVelocity = 0;  // degrees/second (instantaneous)
        this._gyroHeading = 0;   // integrated heading from gyro (may drift)

        this._anim = null;
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

        // Diagonal: wall detected if either adjacent perpendicular wall is present
        return {
            front:      wallRel(0),
            right:      wallRel(90),
            back:       wallRel(180),
            left:       wallRel(270),
            frontRight: wallRel(0)   || wallRel(90),
            backRight:  wallRel(90)  || wallRel(180),
            backLeft:   wallRel(180) || wallRel(270),
            frontLeft:  wallRel(270) || wallRel(0),
            // Gyro: angular velocity with realistic noise
            gyro: this._gyroVelocity + (Math.random() - 0.5) * 1.5,
        };
    }

    get atGoal() {
        return this.maze.isGoal(this.x, this.y);
    }

    set speed(v) { this._speed = Math.max(1, Math.min(10, v)); }
    get speed()  { return this._speed; }

    get _moveDuration() {
        return (11 - this._speed) * 40; // 40ms (speed 10) → 400ms (speed 1)
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    async moveForward(cells = 1) {
        for (let i = 0; i < cells; i++) {
            if (this._stopped) throw new StopError();
            if (this.sensors.front) return false;

            const dirIdx = Math.round(this.angle / 90) % 4;
            const dx = [0, 1, 0, -1][dirIdx];
            const dy = [-1, 0, 1, 0][dirIdx];
            const nx = this.x + dx;
            const ny = this.y + dy;

            await this._startAnim({
                type: 'move',
                fromX: this.x, fromY: this.y,
                toX: nx, toY: ny,
                duration: this._moveDuration,
            });

            this.x = nx;
            this.y = ny;
            this.odometer++;
            this.path.push({ x: this.x, y: this.y });
            this.maze.explored[this.y][this.x] = true;
        }
        return true;
    }

    async turnLeft(deg = 90) {
        if (this._stopped) throw new StopError();
        await this._startAnim({
            type: 'turn',
            fromAngle: this.visAngle,
            toAngle: this.visAngle - deg,
            duration: this._moveDuration,
        });
        this.angle = ((this.angle - deg) % 360 + 360) % 360;
    }

    async turnRight(deg = 90) {
        if (this._stopped) throw new StopError();
        await this._startAnim({
            type: 'turn',
            fromAngle: this.visAngle,
            toAngle: this.visAngle + deg,
            duration: this._moveDuration,
        });
        this.angle = (this.angle + deg) % 360;
    }

    // ── Animation ────────────────────────────────────────────────────────────

    _startAnim(anim) {
        return new Promise((resolve) => {
            this._anim = { ...anim, progress: 0, resolve };
        });
    }

    // Called every frame by the simulator loop
    update(dt) {
        if (!this._anim) {
            this._gyroVelocity = 0;
            return;
        }

        this._anim.progress = Math.min(this._anim.progress + dt / this._anim.duration, 1);
        const t = easeInOut(this._anim.progress);

        if (this._anim.type === 'move') {
            this.visX = lerp(this._anim.fromX, this._anim.toX, t);
            this.visY = lerp(this._anim.fromY, this._anim.toY, t);
        } else if (this._anim.type === 'turn') {
            this.visAngle = lerp(this._anim.fromAngle, this._anim.toAngle, t);

            // Gyro: angular velocity = dAngle/dt (approximated via eased derivative)
            const totalDeg = this._anim.toAngle - this._anim.fromAngle;
            const easeDeriv = this._anim.progress < 0.5
                ? 4 * this._anim.progress
                : 4 * (1 - this._anim.progress);
            this._gyroVelocity = (totalDeg / (this._anim.duration / 1000)) * easeDeriv;
            this._gyroHeading += this._gyroVelocity * (dt / 1000);
        }

        if (this._anim.progress >= 1) {
            const resolve = this._anim.resolve;
            this._anim = null;
            this._gyroVelocity = 0;
            resolve();
        }
    }

    stop()   { this._stopped = true; }
    resume() { this._stopped = false; }
}
