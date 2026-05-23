// ── Default algorithm (Flood Fill) ───────────────────────────────────────────
const DEFAULT_ALGORITHM =
`// ===== 플러드 필 탐색 알고리즘 =====
//
// 제공 객체:
//   robot  — 로봇 제어
//   ff     — FloodFill 인스턴스 (역방향 시간 추산)
//
// 주요 API:
//   ff.sense(robot)                      → 센서 읽어 벽 지식 업데이트 + 재계산
//   ff.bestDir(x, y, facing)             → turn penalty 반영 최적 방향 반환
//   ff.getDistMap()[y][x]                → 각 셀의 목표까지 추산 비용
//   await robot.moveTo('n'|'e'|'s'|'w')  → 절대 방향으로 이동 (smooth/pivot 자동)
//   robot.sensors.gyro                   → 자이로 각속도 (°/s)
//   robot.elapsedTime                    → 누적 물리 시간 (초)
//
// 경계선 감지 모델:
//   moveTo() 는 블럭 경계선(블럭 중심에서 0.5칸)에서 멈추고 제어를 반환합니다.
//   그 시점에 robot.x/y 는 새 셀로 업데이트되고, sensors 는 새 셀의 벽을 읽습니다.
//   따라서 ff.sense() / ff.bestDir() 는 항상 경계선에서 호출됩니다.

function facing() {
    return ['n','e','s','w'][((Math.round(robot.angle / 90)) % 4 + 4) % 4];
}

let steps = 0;
while (!robot.atGoal && steps++ < 3000) {
    // 경계선 도착 시 벽 감지 → 플러드 필 업데이트
    ff.sense(robot);

    // turn penalty를 반영한 최적 이동 방향 계산
    const dir = ff.bestDir(robot.x, robot.y, facing());
    if (!dir) { console.log('경로 없음!'); break; }

    // 다음 경계선까지 이동 (smooth turn 또는 pivot turn 자동 선택)
    await robot.moveTo(dir);
}`;

// ── Simulator controller ──────────────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class Simulator {
    constructor() {
        this.maze     = new Maze();
        this.hardware = new HardwareProfile();
        this.robot    = new Robot(this.maze, this.hardware);
        this.robot.speed = 3;
        this.ff       = new FloodFill(this.maze, this.hardware);
        this.renderer = null;
        this._editor  = null;
        this._running = false;
        this._lastTime = 0;
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
        document.getElementById('btn-new-maze').onclick = () => this.newMaze();
        document.getElementById('btn-default').onclick  = () => this._editor.setValue(DEFAULT_ALGORITHM);

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
}

window.addEventListener('DOMContentLoaded', () => { new Simulator().init(); });
