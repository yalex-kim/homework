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

// ── Phase 1: 목표까지 탐색 ────────────────────────────────────────────────────
let steps = 0;
while (!robot.atGoal && steps++ < 3000) {
    ff.sense(robot);
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('경로 없음!'); break; }
    await robot.moveTo(dir);
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
    await robot.moveTo(dir);
}
console.log(\`Phase 2 완료: \${robot.odometer}칸 / \${robot.elapsedTime.toFixed(2)}s\`);

// ── Phase 3: 최적 경로 속도 주행 ─────────────────────────────────────────────
ff.setGoals([[7,7],[8,7],[7,8],[8,8]]);
steps = 0;

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
    // If there's a trailing turn in the same direction as firstSign (e.g. L-R-L or R-L-R),
    // the diagonal exit arc (which returns to original heading) would immediately be
    // followed by another arc in the same direction → S-curve visual artifact.
    // Avoid this by not using diagonal for this pattern.
    if (pairs * 2 < turns.length && turns[pairs * 2] === turns[0]) {
        pairs--;
    }
    return pairs >= 1 ? { pairs, firstSign: turns[0] } : null;
}

while (!robot.atGoal && steps++ < 3000) {
    ff.sense(robot);
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('경로 없음!'); break; }

    if (facing() === dir) {
        // 직진 방향 — 실제 벽 기준으로 연속 직진 칸 수를 계산해 한 번에 가속 이동
        let cnt = 0, cx = robot.x, cy = robot.y;
        while (cnt < H) {
            if (robot.maze.hasWall(cx, cy, dir)) break;
            const nx = cx + DX[dir], ny = cy + DY[dir];
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) break;
            cx = nx; cy = ny; cnt++;
            if (ff.bestDir(cx, cy, dir) !== dir) break;
        }
        await (cnt >= 2 ? robot.moveForwardFast(cnt) : robot.moveTo(dir));
    } else {
        // 방향 전환 — 대각선 패턴 감지 후 대각선 주행 시도
        const diag = detectDiag(robot.x, robot.y, facing());
        if (diag) {
            const ok = await robot.moveDiag(diag.pairs, diag.firstSign);
            if (!ok) await robot.moveTo(dir);
        } else {
            await robot.moveTo(dir);
        }
    }
}

if (robot.atGoal) {
    console.log(\`완료! \${robot.odometer}칸 / \${robot.elapsedTime.toFixed(2)}s\`);
}`;

// ── Simulator controller ──────────────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class Simulator {
    constructor() {
        this.maze     = new Maze();
        this.hardware = new HardwareProfile();
        this.robot    = new Robot(this.maze, this.hardware);
        this.robot.speed = 1;
        this.ff       = new FloodFill(this.maze, this.hardware);
        this.renderer = null;
        this._editor  = null;
        this._running = false;
        this._lastTime = 0;

        // Lap timer: starts when robot leaves starting cell, stops at goal
        this._lapState   = 'at_start'; // 'at_start' | 'timing' | 'idle'
        this._lapStart   = 0;
        this._lapHistory = [];     // sorted ascending (fastest first)
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

        // Toolbar buttons
        document.getElementById('btn-start').onclick    = () => this.start();
        document.getElementById('btn-stop').onclick     = () => this.stop();
        document.getElementById('btn-reset').onclick    = () => this.reset();
        document.getElementById('btn-new-maze').onclick   = () => this.newMaze();
        document.getElementById('btn-default').onclick    = () => this._editor.setValue(DEFAULT_ALGORITHM);
        document.getElementById('btn-clear-laps').onclick = () => {
            this._lapHistory = [];
            this._lapState   = 'idle';
            this._updateLapDisplay();
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
        this.ff = new FloodFill(this.maze, this.hardware);
        this.renderer.updateMaze(this.maze);
        this.renderer.updateRobot(this.robot);
        this.renderer.updateFloodFill(this.ff);
        this._setStatus('준비', 'idle');
        // Clear lap history on new maze
        this._lapHistory = [];
        this._lapState   = 'at_start';
        this._updateLapDisplay();
    }

    async start() {
        if (this._running) return;
        this._running = true;
        this.robot.resume();
        this._setStatus('실행 중...', 'running');

        try {
            const fn = new AsyncFunction('robot', 'ff', this._editor.getValue());
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
            this.ff = new FloodFill(this.maze, this.hardware);
            this.renderer.updateFloodFill(this.ff);
            this._lapState = 'at_start';
            document.getElementById('lap-live').textContent = '대기 중';
            document.getElementById('lap-live').className   = '';
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

        const turnSel = document.getElementById('hw-turn-type');
        if (turnSel) turnSel.onchange = (e) => { hw.turnType = e.target.value; };
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
        const r      = this.robot;
        const el     = document.getElementById('lap-live');
        const startX = 0, startY = this.maze.height - 1;

        // Robot left start → begin timing
        if (this._lapState === 'at_start') {
            if (r.x !== startX || r.y !== startY) {
                this._lapState = 'timing';
                this._lapStart = r.elapsedTime;
                el.className   = 'timing';
                el.textContent = '0.000s';
            }
        }

        // Timer running → update display, stop at goal
        if (this._lapState === 'timing') {
            const cur = r.elapsedTime - this._lapStart;
            el.textContent = cur.toFixed(3) + 's';
            if (r.atGoal) {
                this._lapHistory.push(cur);
                this._lapHistory.sort((a, b) => a - b);
                this._lapState = 'idle';
                el.className   = 'done';
                el.textContent = cur.toFixed(3) + 's ✓';
                this._updateLapDisplay();
            }
        }

        // Robot returned to start → ready for next lap
        if (this._lapState === 'idle' && r.x === startX && r.y === startY) {
            this._lapState     = 'at_start';
            el.className       = '';
            el.textContent     = '대기 중';
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
