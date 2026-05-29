/*
 * micromouse.c  —  3단계 마이크로마우스 알고리즘 (순수 C)
 *
 * Phase 1: 출발 → 골  (플러드 필 탐색)
 * Phase 2: 골 → 출발  (귀환하며 추가 벽 탐색)
 * Phase 3: 최적 경로 속도 주행  (직진 가속 + 대각 주행)
 *
 * JavaScript 시뮬레이터의 DEFAULT_ALGORITHM을 1:1 변환.
 * HAL 함수(micromouse.h)만 구현하면 어떤 플랫폼에서도 동작합니다.
 */

#include "micromouse.h"
#include <string.h>   /* memset */
#include <stddef.h>   /* NULL  */

/* ──────────────────────────────────────────────────────────────────────────
 * 내부 상수 / 타입
 * ────────────────────────────────────────────────────────────────────────── */

#define MAX_DIST   0xFFFFu
#define MAX_STEPS  3000

/* 방향 델타 (인덱스 = DIR_N/E/S/W) */
static const int DX[4] = {  0, 1, 0, -1 };
static const int DY[4] = { -1, 0, 1,  0 };

/* 반대 방향 */
static const int OPP[4] = { DIR_S, DIR_W, DIR_N, DIR_E };

/* ──────────────────────────────────────────────────────────────────────────
 * 전역 상태
 * ────────────────────────────────────────────────────────────────────────── */

/* 알려진 벽: 비트 k = (1 << DIR_x) 이면 해당 방향에 벽 존재 */
static uint8_t  g_walls[MAZE_H][MAZE_W];

/* 플러드 필 거리 맵 */
static uint16_t g_dist[MAZE_H][MAZE_W];

/* 탐색된 셀 (한 번이라도 방문한 셀) */
static bool     g_explored[MAZE_H][MAZE_W];

/* 현재 목표 셀 목록 */
#define MAX_GOALS 8
static int  g_goals[MAX_GOALS][2];
static int  g_num_goals;

/* ──────────────────────────────────────────────────────────────────────────
 * 내부 헬퍼
 * ────────────────────────────────────────────────────────────────────────── */

static inline bool in_bounds(int x, int y) {
    return x >= 0 && x < MAZE_W && y >= 0 && y < MAZE_H;
}

static inline bool has_wall(int x, int y, int dir) {
    return (g_walls[y][x] & (uint8_t)(1u << dir)) != 0;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 플러드 필 BFS
 * ────────────────────────────────────────────────────────────────────────── */

typedef struct { int16_t x, y; } Cell;
static Cell g_queue[MAZE_W * MAZE_H];

static void ff_compute(void) {
    for (int y = 0; y < MAZE_H; y++)
        for (int x = 0; x < MAZE_W; x++)
            g_dist[y][x] = MAX_DIST;

    int head = 0, tail = 0;

    for (int i = 0; i < g_num_goals; i++) {
        int gx = g_goals[i][0], gy = g_goals[i][1];
        if (!in_bounds(gx, gy)) continue;
        if (g_dist[gy][gx] == MAX_DIST) {
            g_dist[gy][gx] = 0;
            g_queue[tail].x = (int16_t)gx;
            g_queue[tail].y = (int16_t)gy;
            tail++;
        }
    }

    while (head < tail) {
        int x = g_queue[head].x;
        int y = g_queue[head].y;
        head++;
        uint16_t d = g_dist[y][x];

        for (int dir = 0; dir < 4; dir++) {
            if (has_wall(x, y, dir)) continue;
            int nx = x + DX[dir], ny = y + DY[dir];
            if (!in_bounds(nx, ny)) continue;
            if (g_dist[ny][nx] == MAX_DIST) {
                g_dist[ny][nx] = (uint16_t)(d + 1);
                g_queue[tail].x = (int16_t)nx;
                g_queue[tail].y = (int16_t)ny;
                tail++;
            }
        }
    }
}

/* 목표 셀 변경 후 재계산 */
static void ff_set_goals(const int goals[][2], int count) {
    g_num_goals = (count < MAX_GOALS) ? count : MAX_GOALS;
    for (int i = 0; i < g_num_goals; i++) {
        g_goals[i][0] = goals[i][0];
        g_goals[i][1] = goals[i][1];
    }
    ff_compute();
}

/* ──────────────────────────────────────────────────────────────────────────
 * 벽 감지 & 지식 업데이트
 * ────────────────────────────────────────────────────────────────────────── */

static void ff_sense_and_update(int x, int y) {
    bool wn, we, ws, ww;
    hal_sense_walls(&wn, &we, &ws, &ww);

    bool world[4] = { wn, we, ws, ww };
    bool changed  = false;

    for (int dir = 0; dir < 4; dir++) {
        if (world[dir] && !has_wall(x, y, dir)) {
            g_walls[y][x] |= (uint8_t)(1u << dir);
            int nx = x + DX[dir], ny = y + DY[dir];
            if (in_bounds(nx, ny))
                g_walls[ny][nx] |= (uint8_t)(1u << OPP[dir]);
            changed = true;
        }
    }
    g_explored[y][x] = true;
    if (changed) ff_compute();
}

/* ──────────────────────────────────────────────────────────────────────────
 * 최적 방향 계산 (플러드 필 + 회전 페널티)
 * ────────────────────────────────────────────────────────────────────────── */

/*
 * best_dir — (x,y)에서 heading h로 이동 중일 때 다음 최적 방향 반환.
 * 경로 없으면 -1.
 *
 * 회전 페널티: 직진=0, 90°=1, 180°=3  (dist * 4 + pen 으로 스케일)
 */
static int best_dir(int x, int y, int h) {
    int      best_d   = -1;
    uint32_t best_val = (uint32_t)MAX_DIST * 4 + 4;

    for (int dir = 0; dir < 4; dir++) {
        if (has_wall(x, y, dir)) continue;
        int nx = x + DX[dir], ny = y + DY[dir];
        if (!in_bounds(nx, ny)) continue;
        if (g_dist[ny][nx] == MAX_DIST) continue;

        int diff = (dir - h + 4) % 4;  /* 0=직진, 1=우, 2=유턴, 3=좌 */
        uint32_t pen = (diff == 0) ? 0u : (diff == 2) ? 3u : 1u;
        uint32_t val = (uint32_t)g_dist[ny][nx] * 4u + pen;

        if (val < best_val) { best_val = val; best_d = dir; }
    }
    return best_d;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 대각 패턴 감지
 * ────────────────────────────────────────────────────────────────────────── */

typedef struct { int pairs; int first_sign; } DiagResult;

static DiagResult detect_diag(int x, int y, int heading) {
    int turns[16];
    int n = 0;
    int cx = x, cy = y, cur = heading;

    for (int i = 0; i < 16; i++) {
        int nd = best_dir(cx, cy, cur);
        if (nd < 0 || nd == cur) break;

        /* 90° 회전인지 확인 (직진/유턴은 제외) */
        int diff = (nd - cur + 4) % 4;
        if (diff != 1 && diff != 3) break;

        turns[n++] = (diff == 1) ? 1 : -1;  /* +1=우회전, -1=좌회전 */
        cx += DX[nd]; cy += DY[nd]; cur = nd;

        /* 미탐색 셀에 진입하면 중단 */
        if (!g_explored[cy][cx]) break;
    }

    /* R-L 또는 L-R 쌍이 2개 이상이어야 대각 가능 */
    if (n < 2 || turns[0] == turns[1]) {
        DiagResult none = {0, 0}; return none;
    }

    int pairs = 0;
    for (int i = 0; i + 1 < n; i += 2) {
        if (turns[i] == turns[0] && turns[i+1] == -turns[0]) pairs++;
        else break;
    }
    /* S-커브 방지: 1쌍 대각 뒤에 같은 방향 회전이 따라오면 취소 */
    if (pairs == 1 && pairs * 2 < n && turns[pairs * 2] == turns[0])
        pairs--;

    if (pairs < 1) { DiagResult none = {0, 0}; return none; }

    DiagResult r = { pairs, turns[0] };
    return r;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 회전 헬퍼
 * ────────────────────────────────────────────────────────────────────────── */

static void face_dir(int target) {
    int diff = (target - hal_get_heading() + 4) % 4;
    if      (diff == 1) { hal_turn_right(); }
    else if (diff == 3) { hal_turn_left();  }
    else if (diff == 2) { hal_turn_right(); hal_turn_right(); }
    /* diff == 0: 이미 올바른 방향 */
}

/* ──────────────────────────────────────────────────────────────────────────
 * smart_move — 상황에 맞는 최적 이동
 *
 *  • 현재 방향 == 목표 방향 → 연속 직진 가속 (explored 셀까지)
 *  • 방향 전환 필요 + 대각 패턴 → hal_move_diagonal
 *  • 그 외 → face_dir + hal_move_forward (일반 이동)
 * ────────────────────────────────────────────────────────────────────────── */

static void smart_move(int dir) {
    int h = hal_get_heading();

    if (h == dir) {
        /* 연속 explored 직진 칸 수 계산 */
        int cnt = 0;
        int cx = hal_get_x(), cy = hal_get_y();
        while (cnt < MAZE_H) {
            if (has_wall(cx, cy, dir)) break;
            int nx = cx + DX[dir], ny = cy + DY[dir];
            if (!in_bounds(nx, ny)) break;
            if (!g_explored[ny][nx]) break;
            cx = nx; cy = ny; cnt++;
            if (best_dir(cx, cy, dir) != dir) break;
        }
        if (cnt >= 2) {
            hal_move_forward_fast(cnt);
        } else {
            hal_move_forward();   /* 이미 올바른 방향이므로 바로 전진 */
        }
    } else {
        /* 대각 패턴 감지 후 대각 주행 시도 */
        DiagResult diag = detect_diag(hal_get_x(), hal_get_y(), h);
        if (diag.pairs >= 1) {
            bool ok = hal_move_diagonal(diag.pairs, diag.first_sign);
            if (!ok) { face_dir(dir); hal_move_forward(); }
        } else {
            face_dir(dir);
            hal_move_forward();
        }
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * micromouse_run — 메인 진입점
 * ────────────────────────────────────────────────────────────────────────── */

void micromouse_run(void) {
    /* 초기화 */
    memset(g_walls,    0, sizeof(g_walls));
    memset(g_dist,     0, sizeof(g_dist));
    memset(g_explored, 0, sizeof(g_explored));

    /* 경계 벽 설정 */
    for (int x = 0; x < MAZE_W; x++) {
        g_walls[0][x]        |= (1u << DIR_N);
        g_walls[MAZE_H-1][x] |= (1u << DIR_S);
    }
    for (int y = 0; y < MAZE_H; y++) {
        g_walls[y][0]        |= (1u << DIR_W);
        g_walls[y][MAZE_W-1] |= (1u << DIR_E);
    }

    /* Phase 1 목표: 중앙 4칸 */
    static const int GOALS_CENTER[4][2] = {{7,7},{8,7},{7,8},{8,8}};
    ff_set_goals(GOALS_CENTER, 4);

    /* ── Phase 1: 출발 → 골 탐색 ──────────────────────────────────────── */
    for (int steps = 0; !hal_is_at_goal() && steps < MAX_STEPS; steps++) {
        ff_sense_and_update(hal_get_x(), hal_get_y());

        int dir = best_dir(hal_get_x(), hal_get_y(), hal_get_heading());
        if (dir < 0) { hal_log("Phase1: no path"); return; }
        smart_move(dir);
    }
    if (!hal_is_at_goal()) { hal_log("Phase1: goal not reached"); return; }
    hal_log("Phase1 done");

    /* ── Phase 2: 골 → 출발 귀환 (추가 탐색) ──────────────────────────── */
    static const int GOALS_START[1][2] = {{0, MAZE_H-1}};
    ff_set_goals(GOALS_START, 1);

    for (int steps = 0;
         (hal_get_x() != 0 || hal_get_y() != MAZE_H-1) && steps < MAX_STEPS;
         steps++) {
        ff_sense_and_update(hal_get_x(), hal_get_y());

        int dir = best_dir(hal_get_x(), hal_get_y(), hal_get_heading());
        if (dir < 0) { hal_log("Phase2: no path"); break; }
        smart_move(dir);
    }
    hal_log("Phase2 done");

    /* ── Phase 3: 최적 경로 속도 주행 ─────────────────────────────────── */
    ff_set_goals(GOALS_CENTER, 4);

    for (int steps = 0; !hal_is_at_goal() && steps < MAX_STEPS; steps++) {
        ff_sense_and_update(hal_get_x(), hal_get_y());

        int dir = best_dir(hal_get_x(), hal_get_y(), hal_get_heading());
        if (dir < 0) { hal_log("Phase3: no path"); break; }
        smart_move(dir);
    }

    if (hal_is_at_goal()) hal_log("done!");
}
