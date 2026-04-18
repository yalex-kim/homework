# Webapp UI Kit — yAlex's HomeWork

Notion 스타일의 사이드바 + 모듈별 페이지 구조. Google Login 포함.

## Files
- `index.html` — 진입점 (로그인 → 메인 앱)
- `LoginScreen.jsx` — Google 로그인 화면 (목업)
- `Sidebar.jsx` — 좌측 네비게이션
- `Pages.jsx` — TodayPage, TodoPage, JournalPage, TravelPage, StocksPage, EmptyPage
- `webapp.css` — 키트 전용 스타일 (colors_and_type.css에 의존)

## 사용법
`index.html`을 열면 Google 로그인 버튼부터 시작. 클릭하면 목업 로그인 후 "오늘" 페이지로 진입.

## 포함된 모듈
- **오늘** — 할 일, 시장, 저널 프리뷰 카드
- **할 일** — 체크리스트, 아내/나 태그
- **저널** — serif editorial 스타일
- **가족 여행** — 여행별 포토 카드 그리드 (실제 사진은 placeholder)
- **주식** — 포트폴리오 테이블 (mono)
- **캘린더 / 노트 / 북마크 / 가계부** — empty state 플레이스홀더

## 주의
이미지 자산은 모두 플레이스홀더. 실제 가족 여행 사진과 개인 정보는 사용자가 추가해야 합니다.
