/*
 * micromouse.h  —  Hardware Abstraction Layer for micromouse
 *
 * 이 파일의 함수들을 각자 로봇 플랫폼에 맞게 구현하면 됩니다.
 * (STM32 / Arduino / RP2040 등 모두 동일한 인터페이스)
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

/* ── 미로 파라미터 ─────────────────────────────────────────────────────────── */
#define MAZE_W  16
#define MAZE_H  16

/* 방향 상수 (비트 인덱스 = 1<<DIR_x 로 벽 비트마스크에 사용) */
#define DIR_N   0
#define DIR_E   1
#define DIR_S   2
#define DIR_W   3

/* ── HAL: 센서 ────────────────────────────────────────────────────────────── */

/*
 * hal_sense_walls — 현재 셀의 4방향 벽을 월드 좌표로 반환
 *
 * 로봇의 IR 센서(전/후/좌/우)를 읽어 현재 heading 기준으로
 * 월드 좌표계(N/E/S/W)의 벽 유무로 변환해서 채워줍니다.
 *
 * 예시 (heading=E 일 때):
 *   전방 센서 → wall_e
 *   우측 센서 → wall_s
 *   후방 센서 → wall_w
 *   좌측 센서 → wall_n
 */
void hal_sense_walls(bool *wall_n, bool *wall_e, bool *wall_s, bool *wall_w);

/* ── HAL: 이동 ────────────────────────────────────────────────────────────── */

/* 1칸 전진 (현재 heading 방향, 블로킹) */
void hal_move_forward(void);

/* n칸 연속 직진 — 가속/감속 프로파일 적용 (속도 주행용, 블로킹) */
void hal_move_forward_fast(int n);

/* 제자리 90° 좌회전 (블로킹) */
void hal_turn_left(void);

/* 제자리 90° 우회전 (블로킹) */
void hal_turn_right(void);

/*
 * hal_move_diagonal — 대각선 주행
 *
 * pairs     : R-L 또는 L-R 쌍의 수 (1 이상)
 * first_sign: +1=오른쪽 먼저, -1=왼쪽 먼저
 *
 * 지원하지 않는 플랫폼은 { return false; } 로 구현하면
 * 알고리즘이 일반 회전으로 자동 폴백합니다.
 *
 * 성공하면 true, 실패(대각 불가)하면 false 반환.
 */
bool hal_move_diagonal(int pairs, int first_sign);

/* ── HAL: 상태 ────────────────────────────────────────────────────────────── */

/* 현재 셀 X 좌표 (0 = 좌측 끝, 인코더/오도메트리 기반) */
int  hal_get_x(void);

/* 현재 셀 Y 좌표 (0 = 상단, H-1 = 출발 셀) */
int  hal_get_y(void);

/* 현재 heading: DIR_N / DIR_E / DIR_S / DIR_W */
int  hal_get_heading(void);

/* 골 영역 도달 여부 (골 셀 중 하나 이상에 있으면 true) */
bool hal_is_at_goal(void);

/* ── HAL: 디버그 ──────────────────────────────────────────────────────────── */

/* UART 또는 LED 등으로 메시지 출력 (선택 구현) */
void hal_log(const char *msg);

/* ── 공개 진입점 ───────────────────────────────────────────────────────────── */

/* 3단계 알고리즘 실행 — 전원 켠 뒤 호출 */
void micromouse_run(void);
