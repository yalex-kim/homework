class FloodFill {
    constructor(maze, hardware = null) {
        this.maze  = maze;
        this.hw    = hardware;
        this.width  = maze.width;
        this.height = maze.height;
        this.GOALS  = [[7,7],[8,7],[7,8],[8,8]];

        // Known walls — optimistic start: all interior walls unknown (false)
        this.knownWalls = Array.from({length: this.height}, () =>
            Array.from({length: this.width}, () => ({n:false, e:false, s:false, w:false}))
        );

        // dist[y][x] = minimum cost to reach any goal cell from (x, y)
        this.dist = Array.from({length: this.height}, () =>
            Array(this.width).fill(Infinity)
        );

        this._initBoundary();
        this.compute();
    }

    // ── Initialization ───────────────────────────────────────────────────────

    _initBoundary() {
        for (let x = 0; x < this.width; x++) {
            this.knownWalls[0][x].n = true;
            this.knownWalls[this.height - 1][x].s = true;
        }
        for (let y = 0; y < this.height; y++) {
            this.knownWalls[y][0].w = true;
            this.knownWalls[y][this.width - 1].e = true;
        }
    }

    // ── Knowledge update ─────────────────────────────────────────────────────

    // Update knowledge with world-coordinate walls observed at cell (x, y).
    // worldWalls: { n, e, s, w } booleans.
    // Returns true if any new wall was discovered (triggers recompute).
    update(x, y, worldWalls) {
        const ADJ = { n:[0,-1,'s'], e:[1,0,'w'], s:[0,1,'n'], w:[-1,0,'e'] };
        let changed = false;

        for (const [dir, hasWall] of Object.entries(worldWalls)) {
            if (hasWall && !this.knownWalls[y][x][dir]) {
                this.knownWalls[y][x][dir] = true;
                const [dx, dy, opp] = ADJ[dir];
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                    this.knownWalls[ny][nx][opp] = true;
                }
                changed = true;
            }
        }

        if (changed) this.compute();
        return changed;
    }

    // Convenience: read robot's sensors and update knowledge.
    // Converts robot-relative sensor readings to world directions.
    sense(robot) {
        const DIRS = ['n', 'e', 's', 'w'];
        const fi   = ((Math.round(robot.angle / 90)) % 4 + 4) % 4;
        const s    = robot.sensors;

        const worldWalls = {
            [DIRS[fi]]:           s.front,
            [DIRS[(fi+1) % 4]]:   s.right,
            [DIRS[(fi+2) % 4]]:   s.back,
            [DIRS[(fi+3) % 4]]:   s.left,
        };
        return this.update(robot.x, robot.y, worldWalls);
    }

    // ── BFS flood fill ───────────────────────────────────────────────────────

    compute() {
        const DELTA = { n:[0,-1], e:[1,0], s:[0,1], w:[-1,0] };

        for (let y = 0; y < this.height; y++)
            for (let x = 0; x < this.width; x++)
                this.dist[y][x] = Infinity;

        // Seed goal cells
        const queue = [];
        for (const [gx, gy] of this.GOALS) {
            this.dist[gy][gx] = 0;
            queue.push([gx, gy]);
        }

        // BFS (count-based; turn penalties are added in bestDir, not here)
        let head = 0;
        while (head < queue.length) {
            const [x, y] = queue[head++];
            const d = this.dist[y][x];

            for (const [dir, [dx, dy]] of Object.entries(DELTA)) {
                if (this.knownWalls[y][x][dir]) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
                if (d + 1 < this.dist[ny][nx]) {
                    this.dist[ny][nx] = d + 1;
                    queue.push([nx, ny]);
                }
            }
        }
    }

    // ── Navigation ──────────────────────────────────────────────────────────

    // Returns the best world direction ('n'|'e'|'s'|'w') to move from (x, y).
    // facingDir: current robot facing, used to apply turn penalties.
    bestDir(x, y, facingDir = 'n') {
        const DELTA  = { n:[0,-1], e:[1,0], s:[0,1], w:[-1,0] };
        const ANGLES = { n:0, e:90, s:180, w:270 };
        const isSmooth = this.hw && this.hw.turnType === 'smooth';
        const pen90  = isSmooth ? 0.1 : 0.5;   // 90° turn penalty (cells)
        const pen180 = pen90 * 3;               // U-turn penalty

        let bestDir = null, bestVal = Infinity;

        for (const [dir, [dx, dy]] of Object.entries(DELTA)) {
            if (this.knownWalls[y][x][dir]) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
            if (this.dist[ny][nx] === Infinity) continue;

            const diff = ((ANGLES[dir] - ANGLES[facingDir]) + 360) % 360;
            const turnCost = diff === 0 ? 0 : diff === 180 ? pen180 : pen90;

            const total = this.dist[ny][nx] + turnCost;
            if (total < bestVal) {
                bestVal = total;
                bestDir = dir;
            }
        }

        return bestDir;
    }

    getDistMap() { return this.dist; }
}
