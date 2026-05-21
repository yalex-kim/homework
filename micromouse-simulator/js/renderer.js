class Renderer {
    constructor(canvas, maze, robot) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.maze = maze;
        this.robot = robot;
        this.cellSize = 30;
        this.padding = 15;
        this._resize();
    }

    _resize() {
        this.canvas.width  = this.maze.width  * this.cellSize + this.padding * 2;
        this.canvas.height = this.maze.height * this.cellSize + this.padding * 2;
    }

    // Cell-center → canvas pixel
    _cp(cx, cy) {
        return {
            px: this.padding + cx * this.cellSize + this.cellSize / 2,
            py: this.padding + cy * this.cellSize + this.cellSize / 2,
        };
    }

    render() {
        const { ctx, canvas, maze, robot, cellSize, padding } = this;

        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this._drawExplored();
        this._drawGoal();
        this._drawPath();
        this._drawWalls();
        this._drawSensors();
        this._drawRobot();
    }

    _drawExplored() {
        const { ctx, maze, cellSize, padding } = this;
        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                if (maze.explored[y][x]) {
                    ctx.fillStyle = 'rgba(137, 180, 250, 0.12)';
                    ctx.fillRect(
                        padding + x * cellSize + 1,
                        padding + y * cellSize + 1,
                        cellSize - 2, cellSize - 2
                    );
                }
            }
        }
    }

    _drawGoal() {
        const { ctx, cellSize, padding } = this;
        for (let gy = 7; gy <= 8; gy++) {
            for (let gx = 7; gx <= 8; gx++) {
                ctx.fillStyle = 'rgba(166, 227, 161, 0.25)';
                ctx.fillRect(
                    padding + gx * cellSize + 1,
                    padding + gy * cellSize + 1,
                    cellSize - 2, cellSize - 2
                );
            }
        }
        // Goal label
        const { px, py } = this._cp(7.5, 7.5);
        ctx.fillStyle = 'rgba(166, 227, 161, 0.6)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GOAL', px, py);
    }

    _drawPath() {
        const { ctx, robot, cellSize, padding } = this;
        if (robot.path.length < 2) return;

        const totalLen = robot.path.length;
        for (let i = 1; i < totalLen; i++) {
            const a = robot.path[i - 1];
            const b = robot.path[i];
            const alpha = 0.2 + 0.6 * (i / totalLen);
            ctx.beginPath();
            ctx.moveTo(padding + a.x * cellSize + cellSize / 2, padding + a.y * cellSize + cellSize / 2);
            ctx.lineTo(padding + b.x * cellSize + cellSize / 2, padding + b.y * cellSize + cellSize / 2);
            ctx.strokeStyle = `rgba(249, 226, 175, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Line to current visual position
        const last = robot.path[robot.path.length - 1];
        ctx.beginPath();
        ctx.moveTo(padding + last.x * cellSize + cellSize / 2, padding + last.y * cellSize + cellSize / 2);
        ctx.lineTo(padding + robot.visX * cellSize + cellSize / 2, padding + robot.visY * cellSize + cellSize / 2);
        ctx.strokeStyle = 'rgba(249, 226, 175, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _drawWalls() {
        const { ctx, maze, cellSize, padding } = this;
        ctx.strokeStyle = '#cdd6f4';
        ctx.lineWidth = 2;
        ctx.lineCap = 'square';

        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                const px = padding + x * cellSize;
                const py = padding + y * cellSize;
                const w  = maze.walls[y][x];

                ctx.beginPath();
                if (w.n) { ctx.moveTo(px, py);              ctx.lineTo(px + cellSize, py); }
                if (w.e) { ctx.moveTo(px + cellSize, py);   ctx.lineTo(px + cellSize, py + cellSize); }
                if (w.s) { ctx.moveTo(px, py + cellSize);   ctx.lineTo(px + cellSize, py + cellSize); }
                if (w.w) { ctx.moveTo(px, py);              ctx.lineTo(px, py + cellSize); }
                ctx.stroke();
            }
        }
    }

    _drawSensors() {
        const { ctx, robot, cellSize, padding } = this;
        const rpx = padding + robot.visX * cellSize + cellSize / 2;
        const rpy = padding + robot.visY * cellSize + cellSize / 2;
        const beam = cellSize * 0.85;

        const s = robot.sensors;
        const BEAMS = [
            { relDeg: 0,   key: 'front',      color: '#f38ba8' },
            { relDeg: 90,  key: 'right',       color: '#89b4fa' },
            { relDeg: 180, key: 'back',        color: '#a6e3a1' },
            { relDeg: 270, key: 'left',        color: '#f9e2af' },
            { relDeg: 45,  key: 'frontRight',  color: '#cba6f7', isDiag: true },
            { relDeg: 135, key: 'backRight',   color: '#89dceb', isDiag: true },
            { relDeg: 225, key: 'backLeft',    color: '#b4befe', isDiag: true },
            { relDeg: 315, key: 'frontLeft',   color: '#fab387', isDiag: true },
        ];

        for (const { relDeg, key, color, isDiag } of BEAMS) {
            const worldDeg = robot.visAngle + relDeg;
            const rad = (worldDeg - 90) * Math.PI / 180;
            const hasWall = s[key];
            const len = hasWall ? beam * 0.35 : beam;
            const alpha = hasWall ? 0.9 : (isDiag ? 0.2 : 0.3);

            ctx.beginPath();
            ctx.moveTo(rpx, rpy);
            ctx.lineTo(rpx + Math.cos(rad) * len, rpy + Math.sin(rad) * len);

            const rgb = this._hexToRgb(color);
            ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
            ctx.lineWidth = hasWall ? 2 : 1;
            ctx.stroke();

            // Dot at tip when wall detected
            if (hasWall) {
                ctx.beginPath();
                ctx.arc(
                    rpx + Math.cos(rad) * len,
                    rpy + Math.sin(rad) * len,
                    2, 0, Math.PI * 2
                );
                ctx.fillStyle = `rgba(${rgb}, 0.9)`;
                ctx.fill();
            }
        }
    }

    _drawRobot() {
        const { ctx, robot, cellSize, padding } = this;
        const rpx = padding + robot.visX * cellSize + cellSize / 2;
        const rpy = padding + robot.visY * cellSize + cellSize / 2;
        const r = cellSize * 0.32;

        ctx.save();
        ctx.translate(rpx, rpy);
        ctx.rotate((robot.visAngle - 90) * Math.PI / 180);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#f38ba8';
        ctx.fill();
        ctx.strokeStyle = '#cdd6f4';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Direction arrow
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.lineTo(-r * 0.38, r * 0.45);
        ctx.lineTo(r * 0.38, r * 0.45);
        ctx.closePath();
        ctx.fillStyle = '#1e1e2e';
        ctx.fill();

        ctx.restore();
    }

    _hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    }

    updateMaze(maze) {
        this.maze = maze;
        this._resize();
    }

    updateRobot(robot) {
        this.robot = robot;
    }
}
