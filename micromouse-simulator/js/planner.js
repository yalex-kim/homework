// Time-optimal Forward Dijkstra Planner
//
// State: (x, y, heading)  —  heading ∈ {0:N, 1:E, 2:S, 3:W}
//
// Forward Dijkstra from robot's current position to any GOAL state.
// Records parent pointers → reconstructs the single optimal path.
// bestDir(x,y,d) returns the next heading on that path.
//
// Advantage over backward Dijkstra: diagonal R-L/L-R pairs are costed
// correctly because the two diagHalfT edges are traversed in sequence
// during forward expansion, not approximated via a reverse gradient.
//
// Edge model
//   Straight k cells  →  hw.straightCellTime(k, 0, 0)
//   90° smooth-arc turn  →  turnT   (or diagHalfT when pair-completing)
//   180° U-turn           →  uTurnT
//
// Drop-in replacement for FloodFill: same sense/bestDir/setGoals/getDistMap API.

const _TP_DX   = [0, 1, 0, -1];
const _TP_DY   = [-1, 0, 1, 0];
const _TP_DIRS = ['n', 'e', 's', 'w'];

// ── Minimal binary min-heap ───────────────────────────────────────────────────
class _MinHeap {
    constructor() { this._h = []; }
    get size() { return this._h.length; }
    push(cost, val) { this._h.push({cost, val}); this._up(this._h.length - 1); }
    pop() {
        const top = this._h[0];
        const last = this._h.pop();
        if (this._h.length) { this._h[0] = last; this._dn(0); }
        return top;
    }
    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._h[p].cost <= this._h[i].cost) break;
            [this._h[p], this._h[i]] = [this._h[i], this._h[p]]; i = p;
        }
    }
    _dn(i) {
        const n = this._h.length;
        for (;;) {
            let m = i, l = 2*i+1, r = 2*i+2;
            if (l < n && this._h[l].cost < this._h[m].cost) m = l;
            if (r < n && this._h[r].cost < this._h[m].cost) m = r;
            if (m === i) break;
            [this._h[m], this._h[i]] = [this._h[i], this._h[m]]; i = m;
        }
    }
}

// ── TimePlanner ───────────────────────────────────────────────────────────────
class TimePlanner {
    constructor(maze, hardware) {
        this.maze  = maze;
        this.hw    = hardware;
        this.GOALS = [[7,7],[8,7],[7,8],[8,8]];

        const W = maze.width, H = maze.height;

        // Known walls — optimistic start (boundary walls only)
        this.knownWalls = Array.from({length: H}, (_, y) =>
            Array.from({length: W}, (_, x) => ({
                n: y === 0, e: x === W-1, s: y === H-1, w: x === 0,
            }))
        );

        // Robot's current state — updated by sense(); used as Dijkstra seed.
        this._startState = (H - 1) * W * 4;  // enc(0, H-1, 0) = start facing N

        this._distFwd  = null;   // [y][x][d]  seconds from robot to this state
        this._bestDirM = null;   // [y][x][d]  → next direction on optimal path
        this._optimalTime = null;
        this._compute();
    }

    // ── FloodFill-compatible public API ───────────────────────────────────────

    sense(robot) {
        const {x, y} = robot;
        const W = this.maze.width, H = this.maze.height;
        const fi = ((Math.round(robot.angle / 90)) % 4 + 4) % 4;
        const newStart = (y * W + x) * 4 + fi;

        const OPP = {n:'s', e:'w', s:'n', w:'e'};
        let changed = (newStart !== this._startState);
        this._startState = newStart;

        for (const d of _TP_DIRS) {
            if (!this.knownWalls[y][x][d] && robot.maze.hasWall(x, y, d)) {
                this.knownWalls[y][x][d] = true;
                const nx = x + {n:0,e:1,s:0,w:-1}[d];
                const ny = y + {n:-1,e:0,s:1,w:0}[d];
                if (nx >= 0 && nx < W && ny >= 0 && ny < H)
                    this.knownWalls[ny][nx][OPP[d]] = true;
                changed = true;
            }
        }
        if (changed) this._compute();
    }

    setGoals(goals) { this.GOALS = goals; this._compute(); }

    // Returns the next direction on the optimal path from robot's position,
    // or null if unreachable.
    bestDir(x, y, facing) {
        const d = _TP_DIRS.indexOf(facing);
        return d < 0 ? null : (this._bestDirM?.[y]?.[x]?.[d] ?? null);
    }

    // Returns forward-distance map (seconds from robot to each cell).
    getDistMap() {
        const W = this.maze.width, H = this.maze.height;
        const map = Array.from({length: H}, () => new Array(W).fill(Infinity));
        if (!this._distFwd) return map;
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++)
                map[y][x] = Math.min(...this._distFwd[y][x]);
        return map;
    }

    // ── Edge costs from hardware profile ──────────────────────────────────────

    _edgeCosts() {
        const hw = this.hw;
        if (!hw) {
            return {
                straightT: n => n * 0.40,
                turnT:     0.35,
                uTurnT:    1.50,
                diagHalfT: 0.18,
            };
        }
        const straightT = n => hw.straightCellTime(n, 0, 0);

        const r_m   = Math.min(hw.smoothRadius, hw.cellSize * 0.45);
        const vTurn = Math.min(Math.sqrt(9.8 * r_m), hw.maxSpeed);
        const arcLen_m = 0.5 * hw.cellSize * Math.PI / 2;
        const turnT = arcLen_m / vTurn;

        const uTurnT = 2 * hw.straightCellTime(0.5, 0, 0) + hw.pivotTurnTime(180);

        // Diagonal pair half-cost: 45° entry arc + half diagonal straight + 45° exit arc.
        // Two chained diagHalfT edges = diagCost(1), cheaper than 2×turnT.
        const R_d      = 0.15;
        const R_d_m    = R_d * hw.cellSize;
        const diagArcLen_m = R_d_m * Math.PI / 4;
        const diagArcTime  = diagArcLen_m / vTurn;

        const c45 = Math.SQRT1_2;
        const sdx  = 1 - 2 * R_d * (1 - c45);        // ≈ 0.912
        const sdy  = 1 - 2 * R_d * c45;               // ≈ 0.788
        const straightLen = Math.sqrt(sdx * sdx + sdy * sdy);  // ≈ 1.205 cell-units

        const diagStraightTime = hw.straightCellTime(straightLen, vTurn, vTurn);
        const diagCost1 = 2 * diagArcTime + diagStraightTime;
        const diagHalfT = diagCost1 / 2;

        return { straightT, turnT, uTurnT, diagHalfT };
    }

    // ── Core: forward Dijkstra from robot + path reconstruction ──────────────

    _compute() {
        const W = this.maze.width, H = this.maze.height;
        const N = W * H * 4;
        const INF = 1e18;

        const enc = (x, y, d) => (y * W + x) * 4 + d;

        const { straightT, turnT, uTurnT, diagHalfT } = this._edgeCosts();

        // ── Build forward adjacency list ──────────────────────────────────────

        const fwdAdj = Array.from({length: N}, () => []);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                for (let d = 0; d < 4; d++) {
                    const s = enc(x, y, d);

                    // Straight: k = 1 … H cells ahead
                    let cx = x, cy = y;
                    for (let k = 1; k <= H; k++) {
                        if (this.knownWalls[cy][cx][_TP_DIRS[d]]) break;
                        const nx = cx + _TP_DX[d], ny = cy + _TP_DY[d];
                        if (nx < 0 || nx >= W || ny < 0 || ny >= H) break;
                        fwdAdj[s].push({ to: enc(nx, ny, d), cost: straightT(k) });
                        cx = nx; cy = ny;
                    }

                    // 90° turns (left = -1, right = +1)
                    for (const sign of [-1, 1]) {
                        const d2 = ((d + sign) % 4 + 4) % 4;
                        if (this.knownWalls[y][x][_TP_DIRS[d2]]) continue;
                        const nx = x + _TP_DX[d2], ny = y + _TP_DY[d2];
                        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                        fwdAdj[s].push({ to: enc(nx, ny, d2), cost: turnT });
                        // Diagonal half: if the completing opposite turn is also wall-clear.
                        // Two diagHalfT edges in sequence → diagCost(1) < 2×turnT.
                        if (!this.knownWalls[ny][nx][_TP_DIRS[d]]) {
                            fwdAdj[s].push({ to: enc(nx, ny, d2), cost: diagHalfT });
                        }
                    }

                    // 180° U-turn
                    const d_opp = (d + 2) % 4;
                    if (!this.knownWalls[y][x][_TP_DIRS[d_opp]]) {
                        const nx = x + _TP_DX[d_opp], ny = y + _TP_DY[d_opp];
                        if (nx >= 0 && nx < W && ny >= 0 && ny < H)
                            fwdAdj[s].push({ to: enc(nx, ny, d_opp), cost: uTurnT });
                    }
                }
            }
        }

        // ── Forward Dijkstra from robot's current state ───────────────────────
        //
        // distFwd[s] = min time for robot to reach state s.
        // prev[s]    = which state we came from on the cheapest path to s.

        const distFwd = new Float64Array(N).fill(INF);
        const prev    = new Int32Array(N).fill(-1);
        const pq      = new _MinHeap();

        distFwd[this._startState] = 0;
        pq.push(0, this._startState);

        while (pq.size > 0) {
            const {cost, val: s} = pq.pop();
            if (cost > distFwd[s] + 1e-12) continue;
            for (const {to, cost: c} of fwdAdj[s]) {
                const nc = distFwd[s] + c;
                if (nc < distFwd[to] - 1e-12) {
                    distFwd[to] = nc;
                    prev[to] = s;
                    pq.push(nc, to);
                }
            }
        }

        // ── Find best goal state ───────────────────────────────────────────────

        let bestCost = INF, bestGoal = -1;
        for (const [gx, gy] of this.GOALS) {
            if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
            for (let d = 0; d < 4; d++) {
                const s = enc(gx, gy, d);
                if (distFwd[s] < bestCost) { bestCost = distFwd[s]; bestGoal = s; }
            }
        }
        this._optimalTime = isFinite(bestCost) ? bestCost : null;

        // ── Reconstruct path and build bestDir map ────────────────────────────
        //
        // Walk backward from goal → start via parent pointers.
        // For each edge (par → cur) on the optimal path, record:
        //   bestDirM[par_y][par_x][par_d] = heading of cur (= direction to move)
        //
        // For multi-cell straight edges, fill all skipped intermediate cells so
        // that smartMove's cell-by-cell bestDir check doesn't break mid-run.

        this._bestDirM = Array.from({length: H}, () =>
            Array.from({length: W}, () => [null, null, null, null])
        );

        let cur = bestGoal;
        while (cur >= 0 && prev[cur] >= 0) {
            const par = prev[cur];
            const pd = par % 4;
            const pX = Math.floor(par / 4) % W;
            const pY = Math.floor(par / 4 / W);
            const cd = cur % 4;

            this._bestDirM[pY][pX][pd] = _TP_DIRS[cd];

            // Straight edge (same heading) — fill intermediate skipped cells
            if (pd === cd) {
                const cX = Math.floor(cur / 4) % W;
                const cY = Math.floor(cur / 4 / W);
                let ix = pX + _TP_DX[pd], iy = pY + _TP_DY[pd];
                while (ix !== cX || iy !== cY) {
                    this._bestDirM[iy][ix][pd] = _TP_DIRS[pd];
                    ix += _TP_DX[pd]; iy += _TP_DY[pd];
                }
            }

            cur = par;
        }

        // ── Persist forward distances ─────────────────────────────────────────

        this._distFwd = Array.from({length: H}, (_, y) =>
            Array.from({length: W}, (_, x) =>
                [distFwd[enc(x,y,0)], distFwd[enc(x,y,1)],
                 distFwd[enc(x,y,2)], distFwd[enc(x,y,3)]]
            )
        );
    }
}
