# SlideCraft — 개발 계획서

## Goal (확정)

> **임의의 순수 HTML을 그대로 불러와, 파워포인트와 동일한 조작 UX(직접 조작·편집·애니메이션·슬라이드 관리)를 입히는 프레임워크 비종속 브라우저 라이브러리.**

성공 기준(MVP):
1. 임의의 HTML 문자열/DOM을 변형 없이 슬라이드 객체로 import 할 수 있다. ✅ (`importHTML` 단일 + `importDocument`로 top-level 요소 분할·자동 그리드 배치)
2. 객체를 드래그 이동·8핸들 리사이즈·회전으로 직접 조작할 수 있다.
3. 모든 변경이 커맨드 레이어를 경유해 Ctrl+Z/Y로 undo/redo 된다.
4. 정렬 스냅·스마트 가이드로 "PPT 느낌"이 난다.
5. `toJSON()/fromJSON()`으로 프로젝트를 저장·복원할 수 있다.

## 설계 결정 (확정)

| 항목 | 결정 |
|---|---|
| 모델 | **하이브리드** — 객체는 `{x,y,w,h,angle,…,animation}` 속성 + 내부에 순수 HTML 슬롯 |
| 스택 | 순수 TypeScript + Vite, 프레임워크 비종속 |
| 저장형식 | JSON (`toJSON/fromJSON`) 기본, `.pptx` I/O는 후순위 확장 |
| 핵심 불변식 | (1) 모든 객체 = 단일 transform 모델, (2) undo/redo 커맨드 레이어 1일차 배선 |

## 마일스톤

| # | 마일스톤 | 상태 |
|---|---|---|
| M0 | 기반 골격: 모델 + 단일 matrix 렌더 + 스테이지 | ✅ 완료 |
| M1 | 커맨드 기반 undo/redo + toJSON/fromJSON | ✅ 완료 |
| M2 | 선택(클릭/다중/마퀴) + 선택 오버레이 | ✅ 완료 |
| M3 | 직접 조작: 드래그 → 리사이즈 → 회전 | ✅ 완료 |
| M4 | 정렬 스냅 + 스마트 가이드 (MVP 심장 완성) | ✅ 완료 |
| M5 | 텍스트 인라인 편집 | ✅ 완료 |
| M6 | 도형/이미지 | ✅ 완료 |
| M7 | z-order / align / 그룹 | ✅ 완료 |
| M8 | 슬라이드 관리 + 썸네일 | ✅ CRUD/이동/복제 코어 + 썸네일 패널 UI(클릭 전환·드래그 재정렬·추가/복제/삭제) |
| M9 | 클립보드/단축키 | ✅ copy/cut/paste + 복제(Ctrl+D)/전체선택(Ctrl+A)/방향키 nudge(+Shift 10px) |
| M10 | 테마 | ✅ 빌트인 4종(light/dark/editorial/mono) + setTheme 언두 + 스테이지 CSS 변수/배경 반영 + 직렬화 |
| M11 | 애니메이션 + 슬라이드쇼 | ✅ 애니 엔진(preset→WAAPI)+슬라이드 빌드 타임라인+슬라이드별 재생 컨트롤러+덱 네비(deck.ts)+풀스크린 슬라이드쇼 DOM 드라이버(F5/클릭/방향키/Esc) |
| M12 | HTML 내보내기(라운드트립) | ✅ 순수 `exportHTML(doc)` — 덱→자립형 standalone HTML(슬라이드별 스테이지·공유 transform 컨벤션·z-index 정렬·테마 CSS 변수·객체 HTML 무변형) |
| M13 | 발표 가능한 내보내기 | ✅ `exportHTML(doc, {present:true})` — 의존성 0 인라인 슬라이드쇼 런타임(방향키/Space/PageDn 진행·Esc 종료·F 풀스크린·클릭 advance) + `.sc-current` 단일 슬라이드 표시 CSS. `present` 기본 false라 M12 정적 출력·라운드트립 무변경 |
| M14 | 발표자 노트 | ✅ `Slide.notes` 모델 필드 + 무손실 라운드트립 — export가 슬라이드별 숨김 `<aside class="sc-notes">`(plain text, `display:none`)로 stamp, importDeckDocument가 슬라이드 순서로 복원. 노트 없는 덱은 aside 미방출로 출력 바이트 무변경 |

> **Phase 1(M0~M14) 완료.** MVP 성공기준 5개 + 발표/내보내기/노트까지 충족. 아래 Phase 2는 "PPT 충실도 + 실제 사용 가능한 제품화"가 목표.

## Phase 2 — PPT 충실도 + 제품화 (M15~)

우선순위 원칙: 지금까지는 코어 API + 얇은 데모 중심 → **(1) 실제 쓸 수 있는 에디터 UI**를 먼저 채우고, **(2) 고가치 PPT 객체**, **(3) 충실도 기능**, **(4) 제품화** 순. 각 마일스톤도 Phase 1과 동일하게 **모든 변경은 커맨드 레이어 경유 + 라운드트립(export/import) 무손실 + tsc/vitest 통과**를 불변식으로 유지한다.

| # | 마일스톤 | 범위 | 상태 |
|---|---|---|---|
| M15 | 에디터 UI 셸 | 툴바(도형/텍스트/이미지 삽입·정렬·분배·z-order·그룹·undo/redo 버튼) + 속성 패널(위치/크기/회전/불투명도/테마) + 슬라이드 썸네일 레일 통합. 데모를 "실제 편집기"로. | ✅ `Toolbar`(`mountToolbar`)·`PropertyPanel`(`mountProperties`) — 모든 동작이 커맨드 레이어(Store) 경유로 undo 가능, 속성 패널은 단일 선택 반영+coalesce patch. 데모(index.html/main.ts) 통합. 애니메이션 편집 UI는 후속(엔진은 M11에 존재) |
| M16 | 표(Table) 객체 | 행/열 추가·삭제, 셀 인라인 텍스트 편집, 셀 병합, export/import 라운드트립 | ✅ `core/tables.ts` — 순수 `TableData` 격자 모델 + `renderTable`/순수 편집 op(addRow/deleteRow/addColumn/deleteColumn/setCellText/mergeCells/splitCell, 병합은 covered 플래그로 사각 격자 유지·경계 가로지르는 merge는 자동 unspan) + 브라우저 전용 `parseTable`(DOMParser, colspan/rowspan→covered 복원). 표는 `<table>` html을 가진 일반 객체라 문서 라운드트립은 자동 무손실. `Editor.addTable`/`editTable`(parse→순수변형→`store.patch({html})`로 커맨드 레이어 경유·undo). render→parse 라운드트립 포함 14테스트 |
| M17 | 차트 객체 | 막대/선/원형 기본 차트(데이터 모델→SVG 렌더), 데이터 편집, 라운드트립 | ⬜ 미착수 |
| M18 | 커넥터/연결선 | 객체 간 anchor 연결선, 객체 이동 시 자동 추적, 화살표 스타일 | ⬜ 미착수 |
| M19 | 도형 병합·점 편집 | merge shapes(합/차/교집합) + edit points(베지어 정점 편집) | ⬜ 미착수 |
| M20 | 모프 전환 | 슬라이드 간 객체 매칭 → transform/스타일 보간 전환(morph) | ⬜ 미착수 |
| M21 | 슬라이드 마스터/레이아웃 | 공유 배경·플레이스홀더·레이아웃 상속, 마스터 편집 | ⬜ 미착수 |
| M22 | 발표자 보기 | presenter view(현재+다음 슬라이드·노트·경과 타이머), 듀얼 윈도우 | ⬜ 미착수 |
| M23 | 접근성·터치·성능 | ARIA/키보드 내비, 터치 제스처(이동/핀치 리사이즈/회전), 대량 객체 렌더 성능 | ⬜ 미착수 |
| M24 | 제품화 | README + API 문서 + 사용 예제, npm 패키징/배포 메타, 데모 사이트 | ⬜ 미착수 |
| M25 | `.pptx` I/O (최후순위 확장) | OOXML 기반 가져오기/내보내기 — 가능한 범위에서 객체/텍스트/도형 매핑 | ⬜ 미착수 |

## 에이전트 운용 방침

- **드래프팅(코어 구현)은 메인 에이전트가 단일 패스** — 헌법 §6 준수.
- **서브에이전트는 읽기 전용 렌즈/검증으로만**: (a) 마일스톤 완료 시 qa-reviewer 격리 검증, (b) 복잡한 알고리즘(스마트 가이드/스냅 M4, morph M11) 설계 시 Plan 렌즈.
- 팀 병렬은 직교 모듈이 동시 필요할 때만(예: M6 도형엔진 ∥ M11 애니메이션엔진).
