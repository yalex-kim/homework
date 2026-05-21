class Renderer {
    constructor(canvas, maze, robot, floodFill = null) {
        this.canvas    = canvas;
        this.ctx       = canvas.getContext('2d');
        this.maze      = maze;
        this.robot     = robot;
        this.floodFill = floodFill;
        this.showFF    = false;
        this.cellSize  = 30;
        this.padding   = 15;
        this._resize();
    }

    _resize() {
        this.canvas.width  = this.maze.width  * this.cellSize + this.padding * 2;
        this.canvas.height = this.maze.height * this.cellSize + this.padding * 2;
    }

    _cp(cx, cy) {
        return {
            px: this.padding + cx * this.cellSize + this.cellSize / 2,
            py: this.padding + cy * this.cellSize + this.cellSize / 2,
        };
    }

    render() {
        const { ctx, canvas } = this;
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this._drawExplored();
        this._drawGoal();
        if (this.showFF && this.floodFill) this._drawFloodFill();
        this._drawPath();
        this._drawWalls();
        this._drawSensors();
        this._drawRobot();
    }

    _drawExplored() {
        const { ctx, maze, cellSize, padding } = this;
        for (let y = 0; y < maze.height; y++)
            for (let x = 0; x < maze.width; x++)
                if (maze.explored[y][x]) {
                    ctx.fillStyle = 'rgba(137,180,250,0.10)';
                    ctx.fillRect(padding+x*cellSize+1, padding+y*cellSize+1, cellSize-2, cellSize-2);
                }
    }

    _drawGoal() {
        const { ctx, cellSize, padding } = this;
        for (let gy = 7; gy <= 8; gy++)
            for (let gx = 7; gx <= 8; gx++) {
                ctx.fillStyle = 'rgba(166,227,161,0.22)';
                ctx.fillRect(padding+gx*cellSize+1, padding+gy*cellSize+1, cellSize-2, cellSize-2);
            }
        const { px, py } = this._cp(7.5, 7.5);
        ctx.fillStyle = 'rgba(166,227,161,0.55)';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GOAL', px, py);
    }

    _drawFloodFill() {
        const { ctx, maze, cellSize, padding, floodFill } = this;
        const dist     = floodFill.getDistMap();
        const explored = maze.explored;

        let maxDist = 0;
        for (let y = 0; y < maze.height; y++)
            for (let x = 0; x < maze.width; x++)
                if (dist[y][x] !== Infinity) maxDist = Math.max(maxDist, dist[y][x]);
        if (maxDist === 0) return;

        const fs = Math.max(7, Math.floor(cellSize * 0.30));
        ctx.font = `${fs}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                const d    = dist[y][x];
                const vis  = explored[y][x];  // robot has been here
                const px   = padding + x * cellSize;
                const py   = padding + y * cellSize;
                const { px: cx, py: cy } = this._cp(x, y);

                if (d === Infinity) {
                    // Unreachable with current wall knowledge — dark red tint
                    ctx.fillStyle = 'rgba(243,139,168,0.12)';
                    ctx.fillRect(px+1, py+1, cellSize-2, cellSize-2);
                    continue;
                }

                // Color: blue (far) → green (close to goal)
                const ratio = 1 - d / maxDist;
                const red   = Math.round(137 * (1-ratio) + 10  * ratio);
                const green = Math.round(100 * (1-ratio) + 200 * ratio);
                const blue  = Math.round(250 * (1-ratio) + 80  * ratio);

                // Unexplored cells are dimmer
                const bgAlpha  = vis ? 0.28 : 0.10;
                const txtAlpha = vis ? 0.95 : 0.40;

                ctx.fillStyle = `rgba(${red},${green},${blue},${bgAlpha})`;
                ctx.fillRect(px+1, py+1, cellSize-2, cellSize-2);

                ctx.fillStyle = `rgba(${red},${green},${blue},${txtAlpha})`;
                ctx.fillText(d, cx, cy);
            }
        }
    }

    _drawPath() {
        const { ctx, robot, cellSize, padding } = this;
        const pts = robot.path;
        if (pts.length < 1) return;

        const px = (cx) => padding + cx * cellSize + cellSize / 2;
        const py = (cy) => padding + cy * cellSize + cellSize / 2;

        ctx.lineWidth = 2;

        // Historical path segments
        if (pts.length >= 2) {
            for (let i = 1; i < pts.length; i++) {
                const alpha = 0.15 + 0.65 * (i / pts.length);
                ctx.beginPath();
                ctx.moveTo(px(pts[i-1].x), py(pts[i-1].y));
                ctx.lineTo(px(pts[i].x),   py(pts[i].y));
                ctx.strokeStyle = `rgba(249,226,175,${alpha})`;
                ctx.stroke();
            }
        }

        // Current animation segment
        const anim = robot._anim;
        if (anim) {
            const last = pts[pts.length - 1];
            if (anim.type === 'bezier' && anim.cp) {
                // Draw the full bezier preview (dashed), then the traveled portion (solid)
                const cp = anim.cp;
                const tp = (gx, gy) => [px(gx), py(gy)];
                const [x0,y0] = tp(cp[0][0], cp[0][1]);
                const [x1,y1] = tp(cp[1][0], cp[1][1]);
                const [x2,y2] = tp(cp[2][0], cp[2][1]);
                const [x3,y3] = tp(cp[3][0], cp[3][1]);

                // Faint preview of full arc
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
                ctx.strokeStyle = 'rgba(249,226,175,0.18)';
                ctx.setLineDash([3, 4]);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);

                // Solid arc traveled so far (to visual position)
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.bezierCurveTo(x1, y1, x2, y2,
                    padding + robot.visX * cellSize + cellSize/2,
                    padding + robot.visY * cellSize + cellSize/2);
                ctx.strokeStyle = 'rgba(249,226,175,0.85)';
                ctx.lineWidth = 2;
                ctx.stroke();

            } else {
                // Straight or pivot: line to current visual position
                ctx.beginPath();
                ctx.moveTo(px(last.x), py(last.y));
                ctx.lineTo(
                    padding + robot.visX * cellSize + cellSize/2,
                    padding + robot.visY * cellSize + cellSize/2
                );
                ctx.strokeStyle = 'rgba(249,226,175,0.85)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    _drawWalls() {
        const { ctx, maze, cellSize, padding, floodFill } = this;
        ctx.lineCap = 'square';

        const SIDES = [
            ['n', (px, py) => [px,          py,           px+cellSize, py          ]],
            ['e', (px, py) => [px+cellSize,  py,           px+cellSize, py+cellSize ]],
            ['s', (px, py) => [px,           py+cellSize,  px+cellSize, py+cellSize ]],
            ['w', (px, py) => [px,           py,           px,          py+cellSize ]],
        ];

        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                const w  = maze.walls[y][x];
                const k  = floodFill ? floodFill.knownWalls[y][x] : null;
                const bx = padding + x * cellSize;
                const by = padding + y * cellSize;

                for (const [dir, coords] of SIDES) {
                    if (!w[dir]) continue;  // no wall here

                    const known = !k || k[dir];  // known = confirmed by robot (or no FF)

                    if (known) {
                        // Confirmed wall — solid bright line
                        ctx.strokeStyle = '#cdd6f4';
                        ctx.lineWidth   = 2;
                        ctx.setLineDash([]);
                    } else {
                        // Wall exists but robot hasn't discovered it yet — dashed dim
                        ctx.strokeStyle = 'rgba(205,214,244,0.28)';
                        ctx.lineWidth   = 1.5;
                        ctx.setLineDash([3, 5]);
                    }

                    const [x1, y1, x2, y2] = coords(bx, by);
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }
        }
        ctx.setLineDash([]);
    }

    _drawSensors() {
        const { ctx, robot, cellSize, padding } = this;
        const rpx = padding + robot.visX * cellSize + cellSize/2;
        const rpy = padding + robot.visY * cellSize + cellSize/2;
        const beam = cellSize * 0.82;
        const s = robot.sensors;

        const BEAMS = [
            {relDeg:   0, key:'front',      color:'#f38ba8'},
            {relDeg:  90, key:'right',       color:'#89b4fa'},
            {relDeg: 180, key:'back',        color:'#a6e3a1'},
            {relDeg: 270, key:'left',        color:'#f9e2af'},
            {relDeg:  45, key:'frontRight',  color:'#cba6f7', diag:true},
            {relDeg: 135, key:'backRight',   color:'#89dceb', diag:true},
            {relDeg: 225, key:'backLeft',    color:'#b4befe', diag:true},
            {relDeg: 315, key:'frontLeft',   color:'#fab387', diag:true},
        ];

        for (const { relDeg, key, color, diag } of BEAMS) {
            const rad     = (robot.visAngle + relDeg - 90) * Math.PI / 180;
            const hasWall = s[key];
            const len     = hasWall ? beam * 0.35 : beam;
            const alpha   = hasWall ? 0.9 : (diag ? 0.2 : 0.3);

            const rgb = this._hexRgb(color);
            ctx.beginPath();
            ctx.moveTo(rpx, rpy);
            ctx.lineTo(rpx + Math.cos(rad)*len, rpy + Math.sin(rad)*len);
            ctx.strokeStyle = `rgba(${rgb},${alpha})`;
            ctx.lineWidth = hasWall ? 2 : 1;
            ctx.stroke();

            if (hasWall) {
                ctx.beginPath();
                ctx.arc(rpx+Math.cos(rad)*len, rpy+Math.sin(rad)*len, 2, 0, Math.PI*2);
                ctx.fillStyle = `rgba(${rgb},0.9)`;
                ctx.fill();
            }
        }
    }

    _drawRobot() {
        const { ctx, robot, cellSize, padding } = this;
        const rpx = padding + robot.visX * cellSize + cellSize/2;
        const rpy = padding + robot.visY * cellSize + cellSize/2;
        const r   = cellSize * 0.32;

        ctx.save();
        ctx.translate(rpx, rpy);
        ctx.rotate((robot.visAngle - 90) * Math.PI / 180);

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI*2);
        ctx.fillStyle = '#f38ba8';
        ctx.fill();
        ctx.strokeStyle = '#cdd6f4';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -r*0.85);
        ctx.lineTo(-r*0.38, r*0.45);
        ctx.lineTo( r*0.38, r*0.45);
        ctx.closePath();
        ctx.fillStyle = '#1e1e2e';
        ctx.fill();

        ctx.restore();
    }

    _hexRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
    }

    updateMaze(maze)           { this.maze      = maze;      this._resize(); }
    updateRobot(robot)         { this.robot     = robot; }
    updateFloodFill(floodFill) { this.floodFill = floodFill; }
}
