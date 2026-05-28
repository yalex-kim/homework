// Time-optimal Bidirectional Dijkstra Planner
//
// State: (x, y, heading)  —  heading ∈ {0:N, 1:E, 2:S, 3:W}
//
// Forward  Dijkstra: min physical time from START to every state.
// Backward Dijkstra: min physical time from every state to any GOAL.
//
// bestDir: for state (x,y,d), pick the single-step neighbour that
//          minimises  edge_cost + distBwd[neighbour].
//
// Edge model
//   Straight k cells  →  hw.straightCellTime(k, 0, 0)
//     (multi-cell edges let Dijkstra capture the acceleration savings of
//      long runs without stopping between cells)
//   90° smooth-arc turn + enter next cell  →  turnArcTime (matches robot.js)
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

        // Known walls — same optimistic initialisation as FloodFill
        this.knownWalls = Array.from({length: H}, (_, y) =>
            Array.from({length: W}, (_, x) => ({
                n: y === 0, e: x === W-1, s: y === H-1, w: x === 0,
            }))
        );

        this._distBwd  = null;   // [y][x][d]  seconds to reach any goal
        this._distFwd  = null;   // [y][x][d]  seconds from start
        this._bestDirM = null;   // [y][x][d]  → direction char
        this._compute();
    }

    // ── FloodFill-compatible public API ───────────────────────────────────────

    sense(robot) {
        const {x, y} = robot;
        const OPP = {n:'s', e:'w', s:'n', w:'e'};
        let changed = false;
        for (const d of _TP_DIRS) {
            if (!this.knownWalls[y][x][d] && robot.maze.hasWall(x, y, d)) {
                this.knownWalls[y][x][d] = true;
                const nx = x + {n:0,e:1,s:0,w:-1}[d];
                const ny = y + {n:-1,e:0,s:1,w:0}[d];
                if (nx >= 0 && nx < this.maze.width &&
                    ny >= 0 && ny < this.maze.height)
                    this.knownWalls[ny][nx][OPP[d]] = true;
                changed = true;
            }
        }
        if (changed) this._compute();
    }

    setGoals(goals) { this.GOALS = goals; this._compute(); }

    // Returns the direction char that minimises total time to any goal,
    // or null if no path is known.
    bestDir(x, y, facing) {
        const d = _TP_DIRS.indexOf(facing);
        return d < 0 ? null : (this._bestDirM?.[y]?.[x]?.[d] ?? null);
    }

    // Returns a 2-D array of [seconds to goal] for the FF overlay.
    // Values are normalised so the renderer can treat them the same as FF distances.
    getDistMap() {
        const W = this.maze.width, H = this.maze.height;
        const map = Array.from({length: H}, () => new Array(W).fill(Infinity));
        if (!this._distBwd) return map;
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++)
                map[y][x] = Math.min(...this._distBwd[y][x]);
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
            };
        }
        // Straight n cells: trapezoidal profile, start and end at rest.
        // (Multi-cell edges let Dijkstra see the acceleration savings.)
        const straightT = n => hw.straightCellTime(n, 0, 0);

        // Smooth boundary arc (matches _buildBoundaryArc in robot.js):
        //   R = 0.5 * cellSize,  speed limited by hw.smoothRadius (hardware safety).
        const r_m   = Math.min(hw.smoothRadius, hw.cellSize * 0.45);
        const vTurn = Math.min(Math.sqrt(9.8 * r_m), hw.maxSpeed);
        const arcLen_m = 0.5 * hw.cellSize * Math.PI / 2;   // physical arc length
        const turnT = arcLen_m / vTurn;                      // seconds

        // U-turn (180° pivot in place): 2×half-cell linear + pivot time.
        // Matches robot.js moveTo U-turn: advanceToCenter + turnRight(180) + moveForward.
        const uTurnT = 2 * hw.straightCellTime(0.5, 0, 0) + hw.pivotTurnTime(180);

        return { straightT, turnT, uTurnT };
    }

    // ── Core: build edge graph + run both Dijkstras ───────────────────────────

    _compute() {
        const W = this.maze.width, H = this.maze.height;
        const N = W * H * 4;
        const INF = 1e18;

        // State index encoding
        const enc = (x, y, d) => (y * W + x) * 4 + d;

        const { straightT, turnT, uTurnT } = this._edgeCosts();

        // ── Build forward adjacency list ──────────────────────────────────────
        //
        // For each state, add:
        //   • Straight edges of length k = 1 … H  (stop at wall or boundary)
        //   • Left/right 90° turn edges (arc into the next cell)
        //
        // Multi-cell straight edges (k > 1) are what give Dijkstra the
        // ability to find acceleration-optimal long runs automatically.

        const fwdAdj = Array.from({length: N}, () => []);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                for (let d = 0; d < 4; d++) {
                    const s = enc(x, y, d);

                    // Straight: look ahead up to H cells in direction d
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
                    }

                    // 180° U-turn — used only when both 90° options are blocked.
                    // Cost = 2×half-cell travel + in-place pivot, matching robot.js moveTo.
                    const d_opp = (d + 2) % 4;
                    if (!this.knownWalls[y][x][_TP_DIRS[d_opp]]) {
                        const nx = x + _TP_DX[d_opp], ny = y + _TP_DY[d_opp];
                        if (nx >= 0 && nx < W && ny >= 0 && ny < H)
                            fwdAdj[s].push({ to: enc(nx, ny, d_opp), cost: uTurnT });
                    }
                }
            }
        }

        // ── Backward Dijkstra: from goal states, reversed edges ───────────────
        //
        // distBwd[s] = min time to reach any goal from state s.
        // We reverse all forward edges and seed the goal states at cost 0.

        const bwdAdj = Array.from({length: N}, () => []);
        for (let s = 0; s < N; s++)
            for (const {to, cost} of fwdAdj[s])
                bwdAdj[to].push({to: s, cost});

        const distBwd = new Float64Array(N).fill(INF);
        const pqBwd   = new _MinHeap();
        for (const [gx, gy] of this.GOALS) {
            if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
            for (let d = 0; d < 4; d++) {
                const s = enc(gx, gy, d);
                if (distBwd[s] === INF) { distBwd[s] = 0; pqBwd.push(0, s); }
            }
        }
        _runDijkstra(distBwd, pqBwd, bwdAdj, INF);

        // ── Forward Dijkstra: from start (facing North) ───────────────────────
        //
        // distFwd[s] = min time from start to state s.
        // Used for: bidirectional visualisation & optimal-meeting-point query.

        const distFwd = new Float64Array(N).fill(INF);
        const pqFwd   = new _MinHeap();
        const startS  = enc(0, H - 1, 0);   // (0, H-1) facing North
        distFwd[startS] = 0;
        pqFwd.push(0, startS);
        _runDijkstra(distFwd, pqFwd, fwdAdj, INF);

        // ── Bidirectional meeting point ────────────────────────────────────────
        //
        // The optimal path passes through the state u that minimises
        //   distFwd[u] + distBwd[u].
        // This is where the two search frontiers "meet" — the state where
        // combining the forward and backward trees yields the shortest total time.

        let meetCost = INF, meetState = -1;
        for (let s = 0; s < N; s++) {
            const total = distFwd[s] + distBwd[s];
            if (total < meetCost) { meetCost = total; meetState = s; }
        }
        this._optimalTime  = isFinite(meetCost) ? meetCost : null;
        this._meetState    = meetState;

        // ── Persist results ───────────────────────────────────────────────────

        this._distBwd = Array.from({length: H}, (_, y) =>
            Array.from({length: W}, (_, x) =>
                [distBwd[enc(x,y,0)], distBwd[enc(x,y,1)],
                 distBwd[enc(x,y,2)], distBwd[enc(x,y,3)]]
            )
        );
        this._distFwd = Array.from({length: H}, (_, y) =>
            Array.from({length: W}, (_, x) =>
                [distFwd[enc(x,y,0)], distFwd[enc(x,y,1)],
                 distFwd[enc(x,y,2)], distFwd[enc(x,y,3)]]
            )
        );

        // ── Best-direction map ────────────────────────────────────────────────
        //
        // For each state (x,y,d), consider ALL forward edges (including multi-cell
        // straight and U-turn).  Multi-cell straight edges share the same direction
        // as the source heading, so they all return the same dir char; Dijkstra
        // picks whichever k gives the lowest cost+distBwd, which is what we want.
        // U-turn edges return the opposite direction char.

        this._bestDirM = Array.from({length: H}, () =>
            Array.from({length: W}, () => [null, null, null, null])
        );

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                for (let d = 0; d < 4; d++) {
                    const s = enc(x, y, d);
                    let best = INF, bestCh = null;

                    for (const {to, cost} of fwdAdj[s]) {
                        const total = cost + distBwd[to];
                        if (total < best) {
                            best   = total;
                            bestCh = _TP_DIRS[to % 4];
                        }
                    }
                    this._bestDirM[y][x][d] = bestCh;
                }
            }
        }
    }
}

function _runDijkstra(dist, pq, adj, INF) {
    while (pq.size > 0) {
        const {cost, val: s} = pq.pop();
        if (cost > dist[s] + 1e-12) continue;
        for (const {to, cost: c} of adj[s]) {
            const nc = dist[s] + c;
            if (nc < dist[to] - 1e-12) {
                dist[to] = nc;
                pq.push(nc, to);
            }
        }
    }
}
