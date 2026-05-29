// ── Default algorithm (3-phase: explore → return → speed run) ────────────────
const DEFAULT_ALGORITHM =
`// ===== 마이크로마우스 3단계 탐색 알고리즘 =====
//
// Phase 1: 출발 → 목표  (플러드 필 탐색)
// Phase 2: 목표 → 출발  (귀환하며 추가 벽 탐색)
// Phase 3: 최적 경로 속도 주행  (직진 블럭 연결 가속)
//
// API:
//   ff.sense(robot)                         → 벽 탐지 & FF 업데이트
//   ff.bestDir(x, y, facing)                → 최적 방향 반환
//   ff.setGoals([[x,y],...])                → 목표 셀 변경 & FF 재계산
//   ff.knownWalls[y][x][dir]                → 알려진 벽 여부
//   ff.getDistMap()[y][x]                   → 목표까지 추산 비용
//   await robot.moveTo('n'|'e'|'s'|'w')     → 회전+1칸 이동
//   await robot.moveForwardFast(n)          → n칸 연속 직진 (속도 주행용)

function facing() {
    return ['n','e','s','w'][((Math.round(robot.angle / 90)) % 4 + 4) % 4];
}

const W = robot.maze.width, H = robot.maze.height;
const START_X = 0, START_Y = H - 1;
const DX = {n:0, e:1, s:0, w:-1}, DY = {n:-1, e:0, s:1, w:0};

// Detect alternating R-L or L-R turn pattern (diagonal driving opportunity).
// Returns { pairs, firstSign } if ≥1 complete alternating pair found, else null.
function detectDiag(x, y, curFacing) {
    const AMAP = {n:0, e:90, s:180, w:270};
    let cx = x, cy = y, cur = curFacing;
    const turns = [];
    for (let i = 0; i < 16; i++) {
        const nd = ff.bestDir(cx, cy, cur);
        if (!nd || nd === cur) break;
        const diff = ((AMAP[nd] - AMAP[cur]) + 360) % 360;
        if (diff !== 90 && diff !== 270) break;
        turns.push(diff === 90 ? 1 : -1);
        cx += DX[nd]; cy += DY[nd]; cur = nd;
        if (!robot.maze.explored[cy][cx]) break;
    }
    if (turns.length < 2 || turns[0] === turns[1]) return null;
    let pairs = 0;
    for (let i = 0; i + 1 < turns.length; i += 2) {
        if (turns[i] === turns[0] && turns[i+1] === -turns[0]) pairs++;
        else break;
    }
    // Avoid S-curve: 1-pair diagonal followed by same-direction turn.
    if (pairs === 1 && pairs * 2 < turns.length && turns[pairs * 2] === turns[0]) {
        pairs--;
    }
    return pairs >= 1 ? { pairs, firstSign: turns[0] } : null;
}

// 아는 길(explored)은 직진 가속 & 대각 주행, 모르는 길은 일반 이동.
async function smartMove(dir) {
    if (facing() === dir) {
        // 연속 explored 직진 칸 수 계산 후 한 번에 가속 이동
        let cnt = 0, cx = robot.x, cy = robot.y;
        while (cnt < H) {
            if (robot.maze.hasWall(cx, cy, dir)) break;
            const nx = cx + DX[dir], ny = cy + DY[dir];
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) break;
            if (!robot.maze.explored[ny][nx]) break;
            cx = nx; cy = ny; cnt++;
            if (ff.bestDir(cx, cy, dir) !== dir) break;
        }
        await (cnt >= 2 ? robot.moveForwardFast(cnt) : robot.moveTo(dir));
    } else {
        // 대각선 패턴 감지 후 대각선 주행 시도
        const diag = detectDiag(robot.x, robot.y, facing());
        if (diag) {
            const ok = await robot.moveDiag(diag.pairs, diag.firstSign);
            if (!ok) await robot.moveTo(dir);
        } else {
            await robot.moveTo(dir);
        }
    }
}

// ── Phase 1: 목표까지 탐색 ────────────────────────────────────────────────────
let steps = 0;
while (!robot.atGoal && steps++ < 3000) {
    ff.sense(robot);
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('경로 없음!'); break; }
    await smartMove(dir);
}
if (!robot.atGoal) { console.log('목표 도달 실패'); return; }
console.log(\`Phase 1 완료: \${robot.odometer}칸 / \${robot.elapsedTime.toFixed(2)}s\`);

// ── Phase 2: 출발점으로 귀환하며 추가 탐색 ──────────────────────────────────
ff.setGoals([[START_X, START_Y]]);
steps = 0;
while ((robot.x !== START_X || robot.y !== START_Y) && steps++ < 3000) {
    ff.sense(robot);
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('귀환 경로 없음!'); break; }
    await smartMove(dir);
}
console.log(\`Phase 2 완료: \${robot.odometer}칸 / \${robot.elapsedTime.toFixed(2)}s\`);

// ── Phase 3: 최적 경로 속도 주행 ─────────────────────────────────────────────
ff.setGoals([[7,7],[8,7],[7,8],[8,8]]);
steps = 0;
while (!robot.atGoal && steps++ < 3000) {
    ff.sense(robot);
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('경로 없음!'); break; }
    await smartMove(dir);
}

if (robot.atGoal) {
    console.log(\`완료! \${robot.odometer}칸 / \${robot.elapsedTime.toFixed(2)}s\`);
}`;

// ── C 기본 알고리즘 ────────────────────────────────────────────────────────────
const DEFAULT_C_ALGORITHM =
`// ===== 마이크로마우스 3단계 탐색 알고리즘 (C 버전) =====
//
// Phase 1: 출발 → 목표  (플러드 필 탐색)
// Phase 2: 목표 → 출발  (귀환하며 추가 벽 탐색)
// Phase 3: 최적 경로 속도 주행
//
// API (c_sim 제공):
//   ff_sense()                     → 벽 감지 & FF 업데이트
//   ff_best_dir(x, y, facing)      → 최적 방향 반환 ('n'/'e'/'s'/'w', 없으면 0)
//   ff_set_goals(goals, count)     → 목표 셀 변경
//   ff_dist(x, y)                  → 목표까지 추산 비용
//   robot_x() / robot_y()         → 현재 위치
//   robot_facing()                 → 현재 방향 char
//   robot_at_goal()                → 목표 도달 여부
//   maze_w() / maze_h()           → 미로 크기
//   has_wall(x, y, dir)           → 벽 유무
//   cell_explored(x, y)           → 탐색 여부
//   dx(dir) / dy(dir)             → 방향 델타
//   in_maze(x, y)                 → 범위 체크
//   move_to(dir)                  → 회전+1칸 이동 (blocking)
//   move_fast(n)                  → n칸 연속 직진 (blocking)
//   move_diag(pairs, sign)        → 대각 주행, bool 반환 (blocking)
//   log(msg)                      → 콘솔 출력

typedef struct { int pairs; int first_sign; } DiagResult;

DiagResult detect_diag(int x, int y, char cur) {
    int turns[16];
    int n = 0, cx = x, cy = y;
    for (int i = 0; i < 16; i++) {
        char nd = ff_best_dir(cx, cy, cur);
        if (!nd || nd == cur) break;
        int diff = (dir_angle(nd) - dir_angle(cur) + 360) % 360;
        if (diff != 90 && diff != 270) break;
        turns[n++] = (diff == 90) ? 1 : -1;
        cx += dx(nd); cy += dy(nd); cur = nd;
        if (!cell_explored(cx, cy)) break;
    }
    if (n < 2 || turns[0] == turns[1]) return (DiagResult){0, 0};
    int pairs = 0;
    for (int i = 0; i+1 < n; i += 2) {
        if (turns[i] == turns[0] && turns[i+1] == -turns[0]) pairs++;
        else break;
    }
    if (pairs == 1 && pairs*2 < n && turns[pairs*2] == turns[0]) pairs--;
    return pairs >= 1 ? (DiagResult){pairs, turns[0]} : (DiagResult){0, 0};
}

void smart_move(char dir) {
    if (robot_facing() == dir) {
        int cnt = 0, cx = robot_x(), cy = robot_y();
        while (cnt < maze_h()) {
            if (has_wall(cx, cy, dir)) break;
            int nx = cx + dx(dir), ny = cy + dy(dir);
            if (!in_maze(nx, ny)) break;
            if (!cell_explored(nx, ny)) break;
            cx = nx; cy = ny; cnt++;
            if (ff_best_dir(cx, cy, dir) != dir) break;
        }
        if (cnt >= 2) move_fast(cnt);
        else move_to(dir);
    } else {
        DiagResult diag = detect_diag(robot_x(), robot_y(), robot_facing());
        if (diag.pairs >= 1) {
            bool ok = move_diag(diag.pairs, diag.first_sign);
            if (!ok) move_to(dir);
        } else {
            move_to(dir);
        }
    }
}

void run() {
    int H = maze_h();

    // ── Phase 1: 목표까지 탐색 ──────────────────────────────────────────────
    int steps = 0;
    while (!robot_at_goal() && steps++ < 3000) {
        ff_sense();
        char dir = ff_best_dir(robot_x(), robot_y(), robot_facing());
        if (!dir) { log("경로 없음!"); break; }
        smart_move(dir);
    }
    if (!robot_at_goal()) { log("목표 도달 실패"); return; }
    log("Phase 1 완료");

    // ── Phase 2: 출발점으로 귀환 ────────────────────────────────────────────
    int start_goals[1][2] = {{0, H-1}};
    ff_set_goals(start_goals, 1);
    steps = 0;
    while ((robot_x() != 0 || robot_y() != H-1) && steps++ < 3000) {
        ff_sense();
        char dir = ff_best_dir(robot_x(), robot_y(), robot_facing());
        if (!dir) { log("귀환 경로 없음!"); break; }
        smart_move(dir);
    }
    log("Phase 2 완료");

    // ── Phase 3: 최적 경로 속도 주행 ────────────────────────────────────────
    int center_goals[4][2] = {{7,7},{8,7},{7,8},{8,8}};
    ff_set_goals(center_goals, 4);
    steps = 0;
    while (!robot_at_goal() && steps++ < 3000) {
        ff_sense();
        char dir = ff_best_dir(robot_x(), robot_y(), robot_facing());
        if (!dir) { log("경로 없음!"); break; }
        smart_move(dir);
    }
    if (robot_at_goal()) log("완료!");
}`;

// ── Simulator controller ──────────────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class Simulator {
    constructor() {
        this.maze     = new Maze();
        this.hardware = new HardwareProfile();
        this.robot    = new Robot(this.maze, this.hardware);
        this.robot.speed = 1;
        this.ff       = new TimePlanner(this.maze, this.hardware);
        this.renderer = null;
        this._editor  = null;
        this._running = false;
        this._lastTime = 0;
        this._langMode = 'js';   // 'js' | 'c'

        // Lap timer
        this._lapActive      = false;
        this._lapStart       = 0;
        this._lapPrevAtStart = true;
        this._lapHistory     = [];
    }

    init() {
        const canvas = document.getElementById('maze-canvas');
        this.renderer = new Renderer(canvas, this.maze, this.robot, this.ff);

        // CodeMirror editor
        this._editor = CodeMirror.fromTextArea(
            document.getElementById('code-editor'),
            { mode:'javascript', theme:'dracula', lineNumbers:true,
              tabSize:2, indentWithTabs:false, lineWrapping:false, autofocus:true }
        );
        this._editor.setValue(DEFAULT_ALGORITHM);

        // 언어 토글 (JS ↔ C)
        const btnLang = document.getElementById('btn-lang');
        if (btnLang) {
            btnLang.onclick = () => {
                this._langMode = (this._langMode === 'js') ? 'c' : 'js';
                const isC = (this._langMode === 'c');
                btnLang.textContent = isC ? '⚙ C 모드' : '⚙ JS 모드';
                btnLang.classList.toggle('lang-c', isC);
                this._editor.setOption('mode', isC ? 'text/x-csrc' : 'javascript');
                this._editor.setValue(isC ? DEFAULT_C_ALGORITHM : DEFAULT_ALGORITHM);
                // API 레퍼런스 전환
                document.getElementById('api-ref-js').style.display = isC ? 'none' : '';
                document.getElementById('api-ref-c').style.display  = isC ? '' : 'none';
            };
        }

        // Toolbar buttons
        document.getElementById('btn-start').onclick    = () => this.start();
        document.getElementById('btn-stop').onclick     = () => this.stop();
        document.getElementById('btn-reset').onclick    = () => this.reset();
        document.getElementById('btn-new-maze').onclick   = () => this.newMaze();
        document.getElementById('btn-default').onclick    = () => {
            this._editor.setValue(this._langMode === 'c' ? DEFAULT_C_ALGORITHM : DEFAULT_ALGORITHM);
        };
        document.getElementById('btn-clear-laps').onclick = () => {
            this._lapHistory     = [];
            this._lapActive      = false;
            this._lapPrevAtStart = (this.robot.x === 0 && this.robot.y === this.maze.height - 1);
            this._updateLapDisplay();
            const el = document.getElementById('lap-live');
            if (el) { el.className = ''; el.textContent = '대기 중'; }
        };

        // Maze selector
        document.getElementById('maze-select').onchange = () => {
            this.robot.stop();
            setTimeout(() => {
                this._applyMaze(document.getElementById('maze-select').value);
            }, 80);
        };

        // Simulation speed
        const slider = document.getElementById('speed-slider');
        slider.oninput = (e) => {
            const v = parseInt(e.target.value, 10);
            this.robot.speed = v;
            document.getElementById('speed-val').textContent = v;
        };

        // Flood fill overlay — enabled by default
        this.renderer.showFF = true;
        document.getElementById('btn-ff-overlay').classList.add('active');
        document.getElementById('btn-ff-overlay').onclick = (e) => {
            this.renderer.showFF = !this.renderer.showFF;
            e.currentTarget.classList.toggle('active', this.renderer.showFF);
        };

        // Wheel tracks overlay — enabled by default
        document.getElementById('btn-wheels').onclick = (e) => {
            this.renderer.showWheels = !this.renderer.showWheels;
            e.currentTarget.classList.toggle('active', this.renderer.showWheels);
        };

        // Hardware sliders
        this._bindHardwareUI();

        // Load default maze (most recent competition)
        this._applyMaze(document.getElementById('maze-select').value);

        // Render loop
        const loop = (t) => {
            const dt = Math.min(t - this._lastTime, 50);
            this._lastTime = t;
            this.robot.update(dt);
            this.renderer.render();
            this._updateStatus();
            this._checkLapTimer();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // Apply maze by id ('random' or a preset id like '2025')
    _applyMaze(id) {
        if (id === 'random') {
            this.maze.generate();
        } else {
            const preset = MAZE_PRESETS.find(p => p.id === id);
            if (preset) this.maze.loadPreset(parseMazeText(preset.text));
            else this.maze.generate();
        }
        this.robot = new Robot(this.maze, this.hardware);
        this.robot.speed = parseInt(document.getElementById('speed-slider').value, 10);
        this.ff = new TimePlanner(this.maze, this.hardware);
        this.renderer.updateMaze(this.maze);
        this.renderer.updateRobot(this.robot);
        this.renderer.updateFloodFill(this.ff);
        this._setStatus('준비', 'idle');
        // Clear lap history on new maze
        this._lapHistory     = [];
        this._lapActive      = false;
        this._lapPrevAtStart = true;
        this._updateLapDisplay();
    }

    async start() {
        if (this._running) return;
        this._running = true;
        this.robot.resume();
        this._setStatus('실행 중...', 'running');

        try {
            let jsCode = this._editor.getValue();
            if (this._langMode === 'c') {
                // C 코드를 async JS 로 변환 후 run() 을 호출
                jsCode = transpileC(jsCode) + '\nawait run();';
            }
            const fn = new AsyncFunction('robot', 'ff', jsCode);
            await fn(this.robot, this.ff);

            if (this.robot.atGoal) {
                this._setStatus(`목표 도달! ${this.robot.odometer}칸 / ${this.robot.elapsedTime.toFixed(2)}s`, 'goal');
            } else if (this._running) {
                this._setStatus('완료', 'idle');
            }
        } catch (e) {
            if (e.name === 'StopError') {
                this._setStatus('정지됨', 'idle');
            } else {
                this._setStatus(`오류: ${e.message}`, 'error');
                console.error('[알고리즘 오류]', e);
            }
        } finally {
            this._running = false;
        }
    }

    stop() {
        this.robot.stop();
        this._running = false;
    }

    reset() {
        this.robot.stop();
        setTimeout(() => {
            this.robot.reset();
            this.ff = new TimePlanner(this.maze, this.hardware);
            this.renderer.updateFloodFill(this.ff);
            this._lapActive      = false;
            this._lapPrevAtStart = true;
            const lapEl = document.getElementById('lap-live');
            if (lapEl) { lapEl.className = ''; lapEl.textContent = '대기 중'; }
            this._setStatus('준비', 'idle');
        }, 80);
    }

    newMaze() {
        this.robot.stop();
        setTimeout(() => {
            document.getElementById('maze-select').value = 'random';
            this._applyMaze('random');
        }, 80);
    }

    // ── Hardware UI ──────────────────────────────────────────────────────────

    _bindHardwareUI() {
        const hw = this.hardware;
        const bind = (id, key) => {
            const el  = document.getElementById(id);
            const val = document.getElementById(id + '-val');
            if (!el) return;
            el.oninput = (e) => {
                hw[key] = parseFloat(e.target.value);
                if (val) val.textContent = parseFloat(e.target.value).toFixed(
                    e.target.step && e.target.step < 1 ? 3 : 1
                );
            };
        };

        bind('hw-max-speed',     'maxSpeed');
        bind('hw-accel',         'accel');
        bind('hw-decel',         'decel');
        bind('hw-smooth-radius', 'smoothRadius');

    }

    // ── Status bar ───────────────────────────────────────────────────────────

    _setStatus(text, type = 'idle') {
        const el = document.getElementById('stat-status');
        el.textContent = text;
        el.className = `stat-value status-${type}`;
    }

    _updateStatus() {
        const r = this.robot;
        const DIRS = ['북↑','동→','남↓','서←'];
        const di   = ((Math.round(r.angle / 90)) % 4 + 4) % 4;

        document.getElementById('stat-pos').textContent  = `(${r.x},${r.y})`;
        document.getElementById('stat-dir').textContent  = DIRS[di];
        document.getElementById('stat-odo').textContent  = `${r.odometer}칸`;
        document.getElementById('stat-gyro').textContent = `${r._gyroVelocity.toFixed(1)}°/s`;
        document.getElementById('stat-time').textContent = `${r.elapsedTime.toFixed(2)}s`;
    }

    // ── Lap timer ────────────────────────────────────────────────────────────

    _checkLapTimer() {
        const r       = this.robot;
        const el      = document.getElementById('lap-live');
        if (!el) return;

        const atStart = (r.x === 0 && r.y === this.maze.height - 1);
        const prev    = this._lapPrevAtStart;
        this._lapPrevAtStart = atStart;

        if (!this._lapActive) {
            // Edge: robot just LEFT start cell → begin timing
            if (prev && !atStart) {
                this._lapActive = true;
                this._lapStart  = r.elapsedTime;
                el.className    = 'timing';
                el.textContent  = '0.000s';
            }
            // Edge: robot just ARRIVED back at start → ready for next lap
            if (!prev && atStart) {
                el.className   = '';
                el.textContent = '대기 중';
            }
        }

        if (this._lapActive) {
            const cur = r.elapsedTime - this._lapStart;
            el.textContent = cur.toFixed(3) + 's';
            if (r.atGoal) {
                this._lapHistory.push(cur);
                this._lapHistory.sort((a, b) => a - b);
                this._lapActive = false;
                el.className    = 'done';
                el.textContent  = cur.toFixed(3) + 's ✓';
                this._updateLapDisplay();
            }
        }
    }

    _updateLapDisplay() {
        const list = document.getElementById('lap-list');
        if (!list) return;
        if (this._lapHistory.length === 0) {
            list.innerHTML = '<div class="lap-empty">기록 없음</div>';
            return;
        }
        list.innerHTML = this._lapHistory.map((t, i) => `
            <div class="lap-entry ${i === 0 ? 'rank-1' : ''}">
                <span class="lap-rank">#${i + 1}</span>
                <span class="lap-time">${t.toFixed(3)}s</span>
                ${i === 0 ? '<span class="lap-badge">★</span>' : ''}
            </div>
        `).join('');
    }
}

window.addEventListener('DOMContentLoaded', () => { new Simulator().init(); });
