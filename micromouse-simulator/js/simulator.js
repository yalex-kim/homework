// ── Default algorithm (Right-hand rule) ──────────────────────────────────────
const DEFAULT_ALGORITHM =
`// ===== 오른쪽 벽 추종 알고리즘 (Right-hand Rule) =====
//
// API:
//   robot.sensors.front / back / left / right   → 벽 여부 (true = 벽)
//   robot.sensors.frontLeft/Right, backLeft/Right → 대각선 센서
//   robot.sensors.gyro                           → 각속도 (°/초, 자이로 센서)
//   robot.atGoal                                 → 목표 도달 여부
//   robot.odometer                               → 총 이동 칸 수
//
//   await robot.moveForward()   → 한 칸 전진
//   await robot.turnLeft()      → 좌회전 90°
//   await robot.turnRight()     → 우회전 90°

let maxSteps = 5000;  // 무한루프 방지

while (!robot.atGoal && maxSteps-- > 0) {
    const s = robot.sensors;

    if (!s.right) {
        // 오른쪽이 열려있으면: 우회전 후 전진
        await robot.turnRight();
        await robot.moveForward();
    } else if (!s.front) {
        // 앞이 열려있으면: 직진
        await robot.moveForward();
    } else if (!s.left) {
        // 왼쪽이 열려있으면: 좌회전 후 전진
        await robot.turnLeft();
        await robot.moveForward();
    } else {
        // 막힌 경우: U턴
        await robot.turnRight();
        await robot.turnRight();
    }
}`;

// ── Simulator controller ──────────────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class Simulator {
    constructor() {
        this.maze   = new Maze();
        this.robot  = new Robot(this.maze);
        this.renderer = null;
        this._editor  = null;
        this._running = false;
        this._lastTime = 0;
    }

    init() {
        const canvas = document.getElementById('maze-canvas');
        this.renderer = new Renderer(canvas, this.maze, this.robot);

        this._editor = CodeMirror.fromTextArea(
            document.getElementById('code-editor'),
            {
                mode: 'javascript',
                theme: 'dracula',
                lineNumbers: true,
                tabSize: 2,
                indentWithTabs: false,
                lineWrapping: false,
                autofocus: true,
            }
        );
        this._editor.setValue(DEFAULT_ALGORITHM);

        document.getElementById('btn-start').onclick    = () => this.start();
        document.getElementById('btn-stop').onclick     = () => this.stop();
        document.getElementById('btn-reset').onclick    = () => this.reset();
        document.getElementById('btn-new-maze').onclick = () => this.newMaze();
        document.getElementById('btn-default').onclick  = () => this._editor.setValue(DEFAULT_ALGORITHM);

        const slider = document.getElementById('speed-slider');
        slider.oninput = (e) => {
            this.robot.speed = parseInt(e.target.value, 10);
            document.getElementById('speed-val').textContent = e.target.value;
        };

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

    async start() {
        if (this._running) return;
        this._running = true;
        this.robot.resume();
        this._setStatus('실행 중...', 'running');

        const code = this._editor.getValue();
        try {
            const fn = new AsyncFunction('robot', code);
            await fn(this.robot);

            if (this.robot.atGoal) {
                this._setStatus(`목표 도달! (${this.robot.odometer}칸)`, 'goal');
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
            this._setStatus('준비', 'idle');
        }, 80);
    }

    newMaze() {
        this.robot.stop();
        setTimeout(() => {
            this.maze.generate();
            this.robot = new Robot(this.maze);
            this.renderer.updateMaze(this.maze);
            this.renderer.updateRobot(this.robot);
            this._setStatus('준비', 'idle');
        }, 80);
    }

    _setStatus(text, type = 'idle') {
        const el = document.getElementById('stat-status');
        el.textContent = text;
        el.className = `stat-value status-${type}`;
    }

    _updateStatus() {
        const r = this.robot;
        const DIRS = ['북 ↑', '동 →', '남 ↓', '서 ←'];
        const dirIdx = ((Math.round(r.angle / 90) % 4) + 4) % 4;

        document.getElementById('stat-pos').textContent  = `(${r.x}, ${r.y})`;
        document.getElementById('stat-dir').textContent  = DIRS[dirIdx];
        document.getElementById('stat-odo').textContent  = `${r.odometer} 칸`;
        document.getElementById('stat-gyro').textContent =
            `${r._gyroVelocity.toFixed(1)}°/s`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const sim = new Simulator();
    sim.init();
});
