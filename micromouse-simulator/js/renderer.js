class Renderer {
    constructor(canvas, maze, robot, floodFill = null) {
        this.canvas    = canvas;
        this.ctx       = canvas.getContext('2d');
        this.maze      = maze;
        this.robot     = robot;
        this.floodFill = floodFill;
        this.showFF     = false;
        this.showWheels = true;
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

        const pxF = (cx) => padding + cx * cellSize + cellSize / 2;
        const pyF = (cy) => padding + cy * cellSize + cellSize / 2;

        // Half-tread width in cell units (default 86mm / 180mm / 2 ≈ 0.239)
        const treadHalf = robot.hw
            ? (robot.hw.treadWidth / robot.hw.cellSize) / 2
            : 0.239;

        // ─ Historical segments ────────────────────────────────────────────────
        for (let i = 1; i < pts.length; i++) {
            const alpha = 0.15 + 0.65 * (i / pts.length);
            const seg   = pts[i].seg;

            if (seg && seg.type === 'bezier' && seg.cp) {
                // Center: draw actual bezier arc (not straight line)
                const cp = seg.cp;
                ctx.beginPath();
                ctx.moveTo(pxF(cp[0][0]), pyF(cp[0][1]));
                ctx.bezierCurveTo(
                    pxF(cp[1][0]), pyF(cp[1][1]),
                    pxF(cp[2][0]), pyF(cp[2][1]),
                    pxF(cp[3][0]), pyF(cp[3][1])
                );
                ctx.strokeStyle = `rgba(249,226,175,${alpha})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Wheel arcs
                if (this.showWheels) {
                    const { left, right } = this._wheelPtsBezier(cp, treadHalf);
                    this._strokeWheelPath(left,  `rgba(243,139,168,${alpha * 0.75})`, 1.5);
                    this._strokeWheelPath(right, `rgba(137,180,250,${alpha * 0.75})`, 1.5);
                }
            } else {
                // Center: straight line
                ctx.beginPath();
                ctx.moveTo(pxF(pts[i-1].x), pyF(pts[i-1].y));
                ctx.lineTo(pxF(pts[i].x),   pyF(pts[i].y));
                ctx.strokeStyle = `rgba(249,226,175,${alpha})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Wheel lines (only for confirmed move segments, not for initial entry)
                if (this.showWheels && seg && seg.type === 'move') {
                    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
                    const len = Math.sqrt(dx*dx + dy*dy) || 1;
                    // In screen coords (y+ = south): left normal = (dy/len, -dx/len)
                    const lnx = (dy / len) * treadHalf, lny = (-dx / len) * treadHalf;
                    this._strokeWheelPath(
                        [[pts[i-1].x+lnx, pts[i-1].y+lny], [pts[i].x+lnx, pts[i].y+lny]],
                        `rgba(243,139,168,${alpha * 0.75})`, 1.5
                    );
                    this._strokeWheelPath(
                        [[pts[i-1].x-lnx, pts[i-1].y-lny], [pts[i].x-lnx, pts[i].y-lny]],
                        `rgba(137,180,250,${alpha * 0.75})`, 1.5
                    );
                }
            }
        }

        // ─ Current animation segment ──────────────────────────────────────────
        const anim = robot._anim;
        if (anim) {
            const last = pts[pts.length - 1];
            if (anim.type === 'bezier' && anim.cp) {
                const cp = anim.cp;
                const [x0,y0] = [pxF(cp[0][0]), pyF(cp[0][1])];
                const [x1,y1] = [pxF(cp[1][0]), pyF(cp[1][1])];
                const [x2,y2] = [pxF(cp[2][0]), pyF(cp[2][1])];
                const [x3,y3] = [pxF(cp[3][0]), pyF(cp[3][1])];

                // Faint preview of full arc
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
                ctx.strokeStyle = 'rgba(249,226,175,0.18)';
                ctx.setLineDash([3, 4]);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);

                // Solid arc traveled so far (De Casteljau subdivision)
                const curT = easeInOut(anim.progress);
                const sub = this._bezierLeft(cp, curT);
                ctx.beginPath();
                ctx.moveTo(pxF(sub[0][0]), pyF(sub[0][1]));
                ctx.bezierCurveTo(
                    pxF(sub[1][0]), pyF(sub[1][1]),
                    pxF(sub[2][0]), pyF(sub[2][1]),
                    pxF(sub[3][0]), pyF(sub[3][1])
                );
                ctx.strokeStyle = 'rgba(249,226,175,0.85)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Live wheel arcs
                if (this.showWheels) {
                    const { left, right } = this._wheelPtsBezier(cp, treadHalf, 28, curT);
                    this._strokeWheelPath(left,  'rgba(243,139,168,0.85)', 1.5);
                    this._strokeWheelPath(right, 'rgba(137,180,250,0.85)', 1.5);
                }

            } else {
                // Straight or pivot: line to current visual position
                ctx.beginPath();
                ctx.moveTo(pxF(last.x), pyF(last.y));
                ctx.lineTo(
                    padding + robot.visX * cellSize + cellSize/2,
                    padding + robot.visY * cellSize + cellSize/2
                );
                ctx.strokeStyle = 'rgba(249,226,175,0.85)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Live wheel lines (move only, not pivot turns)
                if (this.showWheels && anim.type === 'move') {
                    const dx = anim.toX - anim.fromX, dy = anim.toY - anim.fromY;
                    const len = Math.sqrt(dx*dx + dy*dy) || 1;
                    const lnx = (dy / len) * treadHalf, lny = (-dx / len) * treadHalf;
                    const fx = anim.fromX, fy = anim.fromY;
                    const tx = robot.visX, ty = robot.visY;
                    this._strokeWheelPath(
                        [[fx+lnx, fy+lny], [tx+lnx, ty+lny]],
                        'rgba(243,139,168,0.85)', 1.5
                    );
                    this._strokeWheelPath(
                        [[fx-lnx, fy-lny], [tx-lnx, ty-lny]],
                        'rgba(137,180,250,0.85)', 1.5
                    );
                }
            }
        }
    }

    // De Casteljau left-split: sub-bezier from t=0 to t=tEnd
    _bezierLeft(cp, tEnd) {
        const L = (a, b) => [a[0]*(1-tEnd)+b[0]*tEnd, a[1]*(1-tEnd)+b[1]*tEnd];
        const p01   = L(cp[0], cp[1]);
        const p12   = L(cp[1], cp[2]);
        const p23   = L(cp[2], cp[3]);
        const p012  = L(p01,  p12);
        const p123  = L(p12,  p23);
        const p0123 = L(p012, p123);
        return [cp[0], p01, p012, p0123];
    }

    // Bezier tangent vector at parameter t (in cell coords)
    _bezierTangent(cp, t) {
        const mt = 1 - t;
        return [
            3*(mt*mt*(cp[1][0]-cp[0][0]) + 2*mt*t*(cp[2][0]-cp[1][0]) + t*t*(cp[3][0]-cp[2][0])),
            3*(mt*mt*(cp[1][1]-cp[0][1]) + 2*mt*t*(cp[2][1]-cp[1][1]) + t*t*(cp[3][1]-cp[2][1])),
        ];
    }

    // Sample left/right wheel positions along bezier from t=0 to t=maxT
    // In screen coords (y+ = south): left normal = (ty, -tx), right = (-ty, tx)
    _wheelPtsBezier(cp, treadHalf, N=24, maxT=1) {
        const left = [], right = [];
        for (let i = 0; i <= N; i++) {
            const t    = (i / N) * maxT;
            const pt   = bezierPt(cp[0], cp[1], cp[2], cp[3], t);
            const tang = this._bezierTangent(cp, t);
            const tlen = Math.sqrt(tang[0]*tang[0] + tang[1]*tang[1]) || 1;
            const tx = tang[0]/tlen, ty = tang[1]/tlen;
            const lnx = ty * treadHalf, lny = -tx * treadHalf;
            left.push([pt[0]+lnx, pt[1]+lny]);
            right.push([pt[0]-lnx, pt[1]-lny]);
        }
        return { left, right };
    }

    // Draw an array of [cellX, cellY] points as a polyline
    _strokeWheelPath(pts, color, width) {
        const { ctx, cellSize, padding } = this;
        const pxF = (cx) => padding + cx * cellSize + cellSize/2;
        const pyF = (cy) => padding + cy * cellSize + cellSize/2;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            i === 0
                ? ctx.moveTo(pxF(pts[i][0]), pyF(pts[i][1]))
                : ctx.lineTo(pxF(pts[i][0]), pyF(pts[i][1]));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth   = width;
        ctx.stroke();
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
        const { ctx, robot, cellSize: cs, padding } = this;
        const rpx = padding + robot.visX * cs + cs/2;
        const rpy = padding + robot.visY * cs + cs/2;
        const s = robot.sensors;

        ctx.save();
        ctx.translate(rpx, rpy);
        ctx.rotate(robot.visAngle * Math.PI / 180);

        // Robot body geometry (must match _drawRobot)
        const bw = cs * 0.30, bh = cs * 0.33, ch = cs * 0.09;

        // Sensor cones: relDeg from forward (0=fwd,90=right,270=left,315=fwd-left)
        // In local frame: forward=-y, right=+x
        // Canvas angle for relDeg = (relDeg - 90) * π/180
        const CONES = [
            { relDeg: 315, key: 'frontLeft',  half: 22, color: '#fab387',
              ox: -(bw - ch * 0.5), oy: -(bh - ch * 0.5) },
            { relDeg:  45, key: 'frontRight', half: 22, color: '#cba6f7',
              ox:   bw - ch * 0.5,  oy: -(bh - ch * 0.5) },
            { relDeg:   0, key: 'front',      half: 12, color: '#f38ba8',
              ox:  0,                oy: -bh * 0.85 },
            { relDeg:  90, key: 'right',      half:  8, color: '#89b4fa',
              ox:  bw * 0.90,        oy:  0 },
            { relDeg: 270, key: 'left',       half:  8, color: '#f9e2af',
              ox: -bw * 0.90,        oy:  0 },
        ];

        for (const { relDeg, key, half, color, ox, oy } of CONES) {
            const hasWall = s[key];
            const dir   = (relDeg - 90) * Math.PI / 180;
            const halfR = half * Math.PI / 180;
            const len   = hasWall ? cs * 0.42 : cs * 0.58;
            const rgb   = this._hexRgb(color);

            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.arc(ox, oy, len, dir - halfR, dir + halfR);
            ctx.closePath();
            ctx.fillStyle   = `rgba(${rgb},${hasWall ? 0.28 : 0.07})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${rgb},${hasWall ? 0.70 : 0.18})`;
            ctx.lineWidth   = hasWall ? 1.0 : 0.5;
            ctx.stroke();

            if (hasWall) {
                ctx.beginPath();
                ctx.arc(ox + Math.cos(dir) * len, oy + Math.sin(dir) * len, 2.5, 0, Math.PI*2);
                ctx.fillStyle = `rgba(${rgb},0.95)`;
                ctx.fill();
            }
        }

        ctx.restore();
    }

    _drawRobot() {
        const { ctx, robot, cellSize: cs, padding } = this;
        const rpx = padding + robot.visX * cs + cs/2;
        const rpy = padding + robot.visY * cs + cs/2;

        ctx.save();
        ctx.translate(rpx, rpy);
        ctx.rotate(robot.visAngle * Math.PI / 180);

        // Body geometry — forward is -y in local frame
        const bw = cs * 0.30, bh = cs * 0.33, ch = cs * 0.09;

        // Tread half-width in px (wheel center distance from robot center)
        const treadHalf = robot.hw
            ? (robot.hw.treadWidth / robot.hw.cellSize / 2) * cs
            : 0.239 * cs;

        // Wheel dimensions
        const ww = cs * 0.13;   // wheel width (axle direction)
        const wh = cs * 0.28;   // wheel height (forward direction)
        const wy = bh * 0.56;   // front/rear wheel center offset

        // Four wheels (drawn behind body)
        ctx.fillStyle = '#101018';
        ctx.strokeStyle = 'rgba(160,160,220,0.45)';
        ctx.lineWidth = 0.5;
        for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
            const wx = sx * treadHalf, wcy = sy * wy;
            ctx.fillRect(wx - ww/2, wcy - wh/2, ww, wh);
            ctx.strokeRect(wx - ww/2, wcy - wh/2, ww, wh);
        }

        // Octagonal PCB body
        const octo = () => {
            ctx.beginPath();
            ctx.moveTo(-bw + ch, -bh);
            ctx.lineTo( bw - ch, -bh);
            ctx.lineTo( bw,      -bh + ch);
            ctx.lineTo( bw,       bh - ch);
            ctx.lineTo( bw - ch,  bh);
            ctx.lineTo(-bw + ch,  bh);
            ctx.lineTo(-bw,       bh - ch);
            ctx.lineTo(-bw,      -bh + ch);
            ctx.closePath();
        };
        octo(); ctx.fillStyle = '#0e2038'; ctx.fill();
        octo(); ctx.strokeStyle = '#3a8fe8'; ctx.lineWidth = 1.5; ctx.stroke();

        // Subtle PCB trace lines
        ctx.strokeStyle = 'rgba(58,143,232,0.09)';
        ctx.lineWidth = 0.5;
        for (const fx of [-0.4, 0.4]) {
            ctx.beginPath(); ctx.moveTo(fx*bw, -bh+1); ctx.lineTo(fx*bw,  bh-1); ctx.stroke();
        }
        for (const fy of [-0.4, 0.4]) {
            ctx.beginPath(); ctx.moveTo(-bw+1, fy*bh); ctx.lineTo( bw-1, fy*bh); ctx.stroke();
        }

        // IR sensor PCBs at the two chamfered front corners
        const sc = cs * 0.07;
        for (const sx of [-1, 1]) {
            ctx.save();
            ctx.translate(sx * (bw - ch * 0.5), -bh + ch * 0.5);
            ctx.rotate(sx * 45 * Math.PI / 180);
            // Yellow PCB board
            ctx.fillStyle = '#b88a00';
            ctx.fillRect(-sc * 0.9, -sc * 0.45, sc * 1.8, sc * 0.9);
            // IR emitter dot
            ctx.beginPath();
            ctx.arc(sc * 0.55, 0, sc * 0.26, 0, Math.PI * 2);
            ctx.fillStyle = '#ffee44';
            ctx.fill();
            ctx.restore();
        }

        // Forward direction arrow
        ctx.beginPath();
        ctx.moveTo(0, -bh * 0.70);
        ctx.lineTo(-cs * 0.075, -bh * 0.28);
        ctx.lineTo( cs * 0.075, -bh * 0.28);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,215,50,0.85)';
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
