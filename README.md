# yAlex's HomeWork — Design System

> 나만의 홈 워크스페이스. 집에 들어와 책상 앞에 앉은 것 같은, 따뜻하고 조용한 개인 대시보드.

---

## What is this

**yAlex's HomeWork**는 개인용 올인원 워크스페이스입니다. 공개 서비스가 아닌 본인(과 가족)만 사용하는 공간으로, Google 로그인으로 보호됩니다.

### 담기는 모듈들
- **Todo** — 아내가 요청한 일들, 개인 업무
- **Family Travel** — 가족 여행 사진 포스팅
- **Thoughts / Journal** — 내 생각 포스팅
- **Stocks** — 보유 주식 현황
- **Calendar** — 일정
- **Bookmarks / Links** — 북마크
- **Notes** — 간단한 노트
- **Expenses / Budget** — 가계부

### 제품 형태
- 데스크톱 웹앱 (반응형 고려는 되지만 데스크톱 우선)
- **Notion 스타일의 사이드바 + 컨텐츠 영역** 레이아웃
- 로그인/로그아웃 화면 포함

---

## Sources

사용자가 제공한 리소스:
- **GitHub repo**: `yalex-kim/homework` — (현재 비어 있음 / empty repo)
- **Local folder**: `yAlex_HomeWork/` — (현재 비어 있음)

→ 따라서 이 디자인 시스템은 **완전히 새로 만드는 것**이며, 기존 디자인을 복제한 것이 아닙니다. 나중에 실제 코드가 생기면 이 시스템을 기반으로 구현하면 됩니다.

---

## Aesthetic direction

**Warm & cozy. 종이, 나무, 저녁 램프 불빛.**

- 크림/베이지 바탕, 진한 브라운 텍스트
- 포인트 컬러는 적갈색(clay)과 올리브그린(moss) — 자연에서 온 색
- Serif 헤드라인(editorial) + Sans 본문
- 부드러운 그림자, 종이 같은 텍스처, 아주 살짝의 noise/grain 느낌
- 과한 장식 없음. 여백 많음. 조용함.

피해야 할 것들:
- 보라/파랑 그라디언트
- 네온, 쨍한 색
- 이모지 과다 사용 (가끔 이모지 하나 정도는 OK)
- 글래스모피즘
- 급격한 라운드(너무 둥근 버튼)

---

## Content Fundamentals

> 혼자 쓰는 공간이지만, 글의 톤이 디자인의 한 부분입니다.

### 언어
- **한국어 위주**, 섹션 제목은 한/영 병기도 OK
- 명령형 대신 **부드러운 서술형** 선호 (예: "저장" 보다 "저장하기")

### 어조 (Tone)
- **차분하고 사적**. 친한 친구의 노트를 엿보는 느낌.
- **I/나** 말고 **이름 없이** 서술하는 경우가 많음. "오늘은 ~했다" 식의 일기체.
- 시스템 메시지도 사람 말투. "오늘 할 일이 없네요" / "아직 아무 생각도 쓰지 않았어요" / "조용한 저녁이에요"
- 로딩/빈 상태는 감성적으로: "불러오는 중..." 대신 "잠시만요" 같은 식.

### 케이싱
- 한국어라 케이싱 이슈는 적지만, 영문 제목은 **Title Case** (예: "Family Travel", "My Thoughts")
- 내비게이션 라벨은 짧게, 한 단어 또는 두 단어

### 이모지
- 기본적으로 안 씀. 대신 소박한 아이콘(line-icon, stroke 1.5px).
- 모듈 아이콘은 사용하지만 카피 안에는 거의 안 넣음.

### 예시 카피

**좋은 예**
- 🗒 "오늘의 생각" (Today's Thoughts)
- 🏡 "이번 주말은 어디 갈까"
- 💭 "아내의 요청" (할 일 섹션 헤더)
- "아직 쓰지 않은 날이에요"
- "새 글 쓰기"
- "조용히 저장됨"

**안 좋은 예**
- "AWESOME NEW FEATURE!!! 🚀🚀🚀"
- "Click here to create a new post"
- "Error 404: Page not found"

---

## Visual Foundations

### Color vibe
- 베이스: **크림 화이트 (#FBF6ED)**, 따뜻한 종이색
- 표면: **베이지 카드 (#F3EADA)**, 한 단계 진한 종이
- 텍스트: **다크 브라운 (#2D2520)**, 검정 대신
- 포인트 1: **Clay / 적갈색 (#B45A3C)** — 링크, 액티브, 강조
- 포인트 2: **Moss / 올리브그린 (#6B7A4F)** — 성공, 두 번째 포인트
- 경고/삭제: **Terracotta (#9B4A3A)** — 빨강 대신
- 흐린 텍스트: **Warm gray (#8C7F72)**

### Typography
- **Display / Headline**: **Lora** (Serif, 구글 폰트) — 1960-70년대 editorial 느낌
- **Body / UI**: **Pretendard** (한국어 최적화 sans) — 본문과 라벨
- **Mono**: **JetBrains Mono** — 주식 숫자, 코드, 타임스탬프
- 한글 본문은 Pretendard, 헤드라인은 Lora가 한글이 없으므로 Pretendard의 bold를 사용 (자동 폴백)

### Spacing
- 4px 기본 그리드: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
- 섹션 간 여백은 넉넉하게 — 64~96px
- 카드 내부 패딩은 24~32px

### Borders & corners
- 기본 라운드: **8px** (카드, 버튼)
- 입력 필드: **6px**
- 이미지/사진: **12px** (약간 더 부드럽게)
- 완전 원형은 아바타 정도만

### Shadows
- 아주 부드럽고 따뜻한 그림자. 회색보다 **브라운이 섞인 그림자** 사용.
- 3단계:
  - **sm**: `0 1px 2px rgba(74, 58, 47, 0.06)`
  - **md**: `0 4px 12px rgba(74, 58, 47, 0.08)`
  - **lg**: `0 12px 32px rgba(74, 58, 47, 0.10)`
- 호버 시 sm → md, 한 단계 올라옴

### Backgrounds & textures
- **Subtle paper grain** — 크림 배경에 아주 약한 SVG noise 오버레이 (opacity 3-5%)
- 그라디언트는 **거의 안 씀**. 쓴다면 크림 → 살짝 더 진한 크림 정도.
- 이미지는 **둥근 모서리 + 살짝 그림자**, 사진은 있는 그대로 보여주되 전체적으로 **warm white balance** 선호

### Animation
- **Fade + 아주 작은 slide (4-8px)**, 300ms, ease-out
- 바운스 없음. 튀는 애니메이션 없음.
- 호버는 **opacity 변화 + 그림자 강화**, transform 사용 시 1-2px translateY
- 페이지 전환도 fade만

### Hover / Press states
- **호버**: 배경이 한 단계 진해지고 그림자 한 단계 up (sm → md)
- **프레스**: 배경 2단계 진해지고, 1px translateY(1px)로 살짝 눌림
- 링크 호버: Clay 컬러로 변하며 밑줄 나타남 (underline slide-in)

### Transparency & blur
- 거의 안 씀. **투명도는 모달 배경 한정** (brown 50% opacity 오버레이, no blur)
- 사이드바에는 불투명 솔리드.

### Imagery vibe
- 가족 여행 사진은 **원본 그대로**. 필터 없음.
- 다만 카드에 들어갈 때는 **warm tone에 살짝 맞춰서** 보이도록 (sepia 0%, warm filter 약간).
- 빈 상태 일러스트는 심플한 line drawing 스타일 (펜 그림 느낌)

### Layout rules
- **Sidebar: 240px 고정**, 좌측
- **메인 컨텐츠: max-width 840px**, 가운데 정렬 (editorial 느낌)
- 사진 갤러리 등은 예외적으로 full-width 사용 가능
- 상단에 **고정 요소 없음** — 스크롤하면 다 올라가는 단순한 구조
- 사이드바에만 유일하게 고정 (sticky) 영역

### Cards
- **배경 `--surface-1`**, 라운드 8px, sm 그림자, 테두리 없음 또는 `--border-soft` 1px
- 호버 시 md 그림자

### Iconography
- **Phosphor Icons** (thin 또는 regular weight) — 따뜻하고 부드러운 라인 아이콘
- CDN 사용: `https://unpkg.com/@phosphor-icons/web`
- 크기 기본 20px, 네비게이션 18px
- 색상은 기본 텍스트 컬러, 액티브 상태에서 Clay

---

## Index / 파일 안내

- `README.md` — 이 파일
- `colors_and_type.css` — CSS 변수 (컬러, 타이포, 스페이싱, 그림자)
- `SKILL.md` — 다른 에이전트(Claude Code 등)가 읽고 이 브랜드로 디자인할 수 있게 하는 스킬 정의
- `assets/` — 로고, 아이콘, placeholder 이미지
- `fonts/` — 웹 폰트 (Google Fonts CDN으로 주로 사용, 일부는 로컬)
- `preview/` — 디자인 시스템 탭에 보이는 카드들 (HTML)
- `ui_kits/webapp/` — 웹앱 UI 키트 (사이드바, 모듈 페이지, 로그인)

### UI Kits
- `ui_kits/webapp/` — Notion 스타일 사이드바 + 모듈 페이지 + Google 로그인 화면

---

## Caveats / 남겨둘 것

- 연결된 repo와 로컬 폴더가 모두 비어 있어 **기존 디자인을 복제한 게 아니라 새로 제안**한 시스템입니다.
- 실제 가족 여행 사진/로고 등 개인 자산은 사용자가 나중에 추가해야 합니다. 현재는 placeholder 사용.
- 폰트는 **Google Fonts CDN** 경유 (Lora, JetBrains Mono). Pretendard는 공식 CDN 사용.
