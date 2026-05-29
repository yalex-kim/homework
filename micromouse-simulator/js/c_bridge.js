// c_bridge.js  —  C 알고리즘 코드를 브라우저에서 실행하는 트랜스파일러
//
// 사용자가 에디터에 C 코드를 입력하면:
//   1. transpileC(code) 로 async JavaScript 로 변환
//   2. 변환된 JS 코드에 런타임 심(shim) 을 주입
//   3. run() 함수를 simulator 가 실행
//
// 지원 C 서브셋:
//   int / bool / char / float / uint8_t 등 기본 타입
//   if/else / for / while / break / return
//   함수 정의·호출 / 1D·2D 배열 / struct 리터럴
//   시뮬레이터 API (ff_* / robot_* / move_* 등)

'use strict';

// ── 런타임 심(shim) ────────────────────────────────────────────────────────────
// C API 함수들을 simulator 의 robot/ff 객체에 연결.
// transpileC() 가 변환된 코드 앞에 자동으로 삽입됩니다.
const C_RUNTIME = `
// ── Simulator shims (C API → robot/ff) ──────────────────────────────────────
const _DIRS = ['n','e','s','w'];
const _DX   = {n:0,  e:1, s:0,  w:-1};
const _DY   = {n:-1, e:0, s:1,  w:0 };
const _ANG  = {n:0,  e:90, s:180, w:270};

function _dirChar(v) {
    if (typeof v === 'string') return v;
    return _DIRS[((v % 4) + 4) % 4];
}

// 위치·상태
function robot_x()      { return robot.x; }
function robot_y()      { return robot.y; }
function robot_facing() {
    return _DIRS[(((Math.round(robot.angle/90))%4)+4)%4];
}
function robot_at_goal()  { return robot.atGoal; }
function robot_odometer() { return robot.odometer; }
function robot_time()     { return robot.elapsedTime; }
function maze_w()         { return robot.maze.width; }
function maze_h()         { return robot.maze.height; }

// 방향 유틸
function dir_angle(d)  { return _ANG[_dirChar(d)] ?? 0; }
function dx(d)         { return _DX[_dirChar(d)]  ?? 0; }
function dy(d)         { return _DY[_dirChar(d)]  ?? 0; }
function in_maze(x,y)  { return x>=0 && x<maze_w() && y>=0 && y<maze_h(); }

// 플러드 필
function ff_sense() { ff.sense(robot); }
function ff_dist(x, y) { return ff.getDistMap()[y][x]; }
function ff_best_dir(x, y, facing) {
    const f = _dirChar(facing);
    return ff.bestDir(x, y, f) || 0;
}
function ff_set_goals(goals, count) {
    const g = [];
    for (let i = 0; i < count; i++) g.push([goals[i][0], goals[i][1]]);
    ff.setGoals(g);
}
function has_wall(x, y, dir) {
    return ff.knownWalls[y]?.[x]?.[_dirChar(dir)] === true;
}
function cell_explored(x, y) {
    return robot.maze.explored[y]?.[x] === true;
}

// 이동 (내부적으로 async, C 코드에서는 blocking 처럼 사용)
async function move_to(dir) {
    await robot.moveTo(_dirChar(dir));
}
async function move_forward() {
    await robot.moveTo(robot_facing());
}
async function move_fast(n)            { await robot.moveForwardFast(n); }
async function move_diag(pairs, sign)  { return await robot.moveDiag(pairs, sign); }
async function turn_to(dir) {
    const cur = robot_facing(), tgt = _dirChar(dir);
    const diff = ((_ANG[tgt] - _ANG[cur]) + 360) % 360;
    if      (diff === 90)  await robot.turnRight();
    else if (diff === 270) await robot.turnLeft();
    else if (diff === 180) { await robot.turnRight(); await robot.turnRight(); }
}

function log(msg) { console.log(String(msg)); }
// ────────────────────────────────────────────────────────────────────────────
`;

// ── 트랜스파일러 ───────────────────────────────────────────────────────────────
function transpileC(cCode) {
    let c = cCode;

    // 1. 전처리기 지시문 제거 / 변환
    c = c.replace(/^[ \t]*#[ \t]*include[^\n]*/gm, '');
    c = c.replace(/^[ \t]*#[ \t]*pragma[^\n]*/gm, '');
    // 단순 숫자 #define → const
    c = c.replace(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+([\d.]+)[uf]?[ \t]*$/gm,
        (_, n, v) => `const ${n} = ${v};`);
    c = c.replace(/^[ \t]*#[ \t]*define[^\n]*/gm, '');

    // 2. typedef struct 제거 (DiagResult 는 런타임에서 일반 object 로 처리)
    c = c.replace(/typedef\s+struct\s*\{[^}]*\}\s*\w+\s*;/gs, '');
    // 전방 선언 제거
    c = c.replace(/^[ \t]*(?:static\s+)?(?:void|int|bool|char|DiagResult)\s+\w+\s*\([^)]*\)\s*;[ \t]*$/gm, '');

    // 3. 2D 배열 초기화: int goals[4][2] = {{7,7},{8,7},...};
    c = c.replace(
        /(?:static\s+)?(?:const\s+)?(?:int|char|bool)\s+(\w+)\s*\[\d*\]\s*\[\d+\]\s*=\s*\{([\s\S]*?)\}\s*;/g,
        (_, name, body) => {
            const js = body.replace(/\{([^{}]+)\}/g, (__, inner) => `[${inner.trim()}]`);
            return `let ${name} = [${js.trim()}];`;
        }
    );
    // 1D 배열 초기화: int arr[] = {a,b,c};
    c = c.replace(
        /(?:static\s+)?(?:const\s+)?(?:int|char|bool)\s+(\w+)\s*\[\d*\]\s*=\s*\{([^}]*)\}\s*;/g,
        (_, name, body) => `let ${name} = [${body.trim()}];`
    );
    // 1D 배열 선언: int turns[16];
    c = c.replace(
        /\b(?:int|bool|char)\s+(\w+)\s*\[(\d+)\]\s*;/g,
        (_, name, size) => `let ${name} = new Array(${size}).fill(0);`
    );

    // 4. DiagResult 리터럴
    // DiagResult r = {p, s};
    c = c.replace(/\bDiagResult\s+(\w+)\s*=\s*\{([^}]*)\}\s*;/g, (_, name, body) => {
        const [p, s] = body.split(',').map(x => x.trim());
        return `let ${name} = {pairs:${p||0}, first_sign:${s||0}};`;
    });
    // DiagResult r;
    c = c.replace(/\bDiagResult\s+(\w+)\s*;/g,
        (_, n) => `let ${n} = {pairs:0, first_sign:0};`);
    // return (DiagResult){p, s};
    c = c.replace(/return\s+\(DiagResult\)\s*\{([^}]*)\}\s*;/g, (_, body) => {
        const [p, s] = body.split(',').map(x => x.trim());
        return `return {pairs:${p||0}, first_sign:${s||0}};`;
    });
    // return pairs >= 1 ? (DiagResult){p,s} : (DiagResult){0,0};
    c = c.replace(/\(DiagResult\)\s*\{([^}]*)\}/g, (_, body) => {
        const [p, s] = body.split(',').map(x => x.trim());
        return `{pairs:${p||0}, first_sign:${s||0}}`;
    });

    // 5. 함수 정의 → async function
    c = c.replace(
        /(?:static\s+)?(?:void|int|bool|char|float|DiagResult|uint8_t|uint16_t|uint32_t)\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
        (_, name, params) => `async function ${name}(${_stripTypes(params)}) {`
    );

    // 6. 변수 선언에서 타입 제거 (배열 처리 이후에 실행)
    c = c.replace(
        /\b(?:static\s+)?(?:const\s+)?(int|bool|char|float|double|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t)\s+([A-Za-z_]\w*)\s*(?=[=;,])/g,
        (_, type, name) => `let ${name}`
    );
    c = c.replace(/\bconst\s+let\b/g, 'const');

    // 7. 이동 함수에 await 삽입
    //    bool ok = move_diag(...); → let ok = await move_diag(...);
    c = c.replace(/\bmove_to\s*\(/g,      'await move_to(');
    c = c.replace(/\bmove_forward\s*\(\s*\)/g, 'await move_forward()');
    c = c.replace(/\bmove_fast\s*\(/g,    'await move_fast(');
    c = c.replace(/\bturn_to\s*\(/g,      'await turn_to(');
    // move_diag: 결과를 받는 경우와 직접 if 에 쓰는 경우 모두 처리
    c = c.replace(/\bmove_diag\s*\(/g,    'await move_diag(');

    // 8. 기타 C→JS 변환
    c = c.replace(/\bNULL\b/g, 'null');
    // char 방향 리터럴: 'n' 'e' 's' 'w' 는 JS 에서도 동일하게 동작
    // C 에서 0 은 "방향 없음" 을 의미 → JS 에서도 falsy

    // 9. printf / hal_log → console.log
    c = c.replace(/\bprintf\s*\(/g,   'console.log(');
    c = c.replace(/\bhal_log\s*\(/g,  'console.log(');
    c = c.replace(/\blog\s*\(/g,      'log(');

    // double-await 방지
    c = c.replace(/\bawait\s+await\b/g, 'await');

    return C_RUNTIME + '\n' + c;
}

function _stripTypes(params) {
    if (!params.trim() || params.trim() === 'void') return '';
    return params.split(',').map(p => {
        p = p.trim();
        if (!p) return '';
        // 마지막 토큰이 변수명
        const m = p.match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/);
        return m ? m[1] : p;
    }).filter(Boolean).join(', ');
}

// 외부에 노출
window.transpileC = transpileC;
