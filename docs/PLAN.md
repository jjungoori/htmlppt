# SlideCraft — 개발 계획서

## Goal (확정)

> **임의의 순수 HTML을 그대로 불러와, 파워포인트와 동일한 조작 UX(직접 조작·편집·애니메이션·슬라이드 관리)를 입히는 프레임워크 비종속 브라우저 라이브러리.**
>
> **주력 유스케이스(headline):** *AI가 생성한 HTML 슬라이드*를 가져와 **진짜 파워포인트처럼** 직접 수정한다 — 슬라이드를 감싼 컨테이너를 풀어(`importSlideHTML`, unwrap) 제목·문단·이미지·도형을 각각 독립 편집 객체로 만들고, 더블클릭 텍스트 편집·드래그·리사이즈·회전으로 손본 뒤 다시 자립형 HTML로 내보낸다.

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
| M17 | 차트 객체 | 막대/선/원형 기본 차트(데이터 모델→SVG 렌더), 데이터 편집, 라운드트립 | ✅ `core/charts.ts` — 순수 `ChartData`(kind/categories/series/style) + `renderChart`(데이터→`<svg class="sc-chart">`: bar 그룹막대/line 폴리라인+점/pie 슬라이스, 축·범례 포함) + 순수 데이터 편집 op(setValue/add·removeCategory/add·removeSeries/rename·setChartKind, 모두 비파괴 clone). 전체 spec을 루트 svg `data-sc-chart` JSON 속성에 stamp → 시각화는 SVG, 데이터는 속성으로 무손실 라운드트립(`parseChart`, DOMParser, 브라우저 전용). 차트는 `<svg>` html 일반 객체라 문서 라운드트립 자동 무손실. `Editor.addChart`/`editChart`(parse→순수변형→`store.patch({html})`로 커맨드 레이어 경유·undo). render→parse 라운드트립 포함 16테스트 |
| M18 | 커넥터/연결선 | 객체 간 anchor 연결선, 객체 이동 시 자동 추적, 화살표 스타일 | ✅ `core/connectors.ts` — 순수 `ConnectorData`(from/to ref+side, routing straight/orthogonal, arrowStart/End, style) + 순수 라우터 `routeConnector`(anchor 박스→polyline 점+패딩 bbox, `anchorPoint`의 'auto'는 peer 방향 변 선택) + 순수 직렬화 `renderConnector`(bbox 로컬좌표 polyline + 명시적 화살표 polygon) + 순수 spec-edit op(setRouting/setSide/setArrows/setStyle, 비파괴). spec을 루트 svg `data-sc-connector` JSON에 stamp → 시각화 SVG·데이터 속성으로 무손실 라운드트립(`parseConnector`). 커넥터는 `<svg>` html 일반 객체라 문서 라운드트립 자동 무손실. `Editor.addConnector`/`editConnector`/`reflowConnectors`(parse→순수변형→재라우팅→`store.patch` 커맨드 레이어 경유·undo). 자동 추적: move/resize onMove에서 `reflowConnectors(key)`로 끝점 재추적(같은 undo 키 coalesce). render→parse 라운드트립 포함 16테스트 |
| M19 | 도형 병합·점 편집 | merge shapes(합/차/교집합) + edit points(베지어 정점 편집) | ✅ `core/path.ts` — 순수 `PathData`(anchor 노드 + 선택적 큐빅 베지어 in/out 핸들 + closed + style, 좌표는 슬라이드 월드 공간이라 두 path 객체가 한 좌표계 공유) + 순수 `pathD`/`renderPath`(spec→SVG `d`, 직선 close는 Z에 위임) + 순수 점편집 op(translatePath/moveNode(핸들 동반)/setNodeHandle/addNode/deleteNode, 모두 비파괴, 2노드 floor) + 순수 boolean `booleanPath`(Greiner–Hormann anchor 폴리곤 합/교/차 + 교차 없을 때 포함관계 fallback). 전체 spec을 루트 svg `data-sc-path` JSON에 stamp → 시각화 SVG·데이터 속성 무손실 라운드트립(`parsePath`, DOMParser, 브라우저 전용). path는 `<svg>` html 일반 객체라 문서 라운드트립 자동 무손실. `Editor.addPath`/`editPath`(parse→순수변형→bbox 재적합→`store.patch` 커맨드 경유·undo)/`mergeShapes`(parse 두 객체→booleanPath→`store.replaceObjects`로 피연산자 제거+결과 링 추가를 단일 undo 단계). 면적 검증(교집합 25·합집합 175·차집합 75) 포함 15테스트 |
| M20 | 모프 전환 | 슬라이드 간 객체 매칭 → transform/스타일 보간 전환(morph) | ✅ `core/morph.ts` — 순수 read-only 모듈(문서 미변형이라 커맨드 불필요·라운드트립 무관). `planMorph(from,to)`: 결정론적 객체 매칭(1차 id, 2차 동일 html greedy, 각 객체 1회) → `{matched, entering, exiting}`. `morphFrame(pair,t)`: x/y/w/h/scale/opacity 선형 보간 + angle 최단경로(350°→10°=+20°), t는 [0,1] 클램프 — 비-WAAPI 드라이버/테스트용. `morphKeyframes(pair)`: 목적지 요소를 t=0에 from 포즈로 되돌렸다가 to로(box 비율을 시작 scale에 접어넣음 `from.w/to.w`, 0 크기 가드) 절대 transform 키프레임 — 슬라이드쇼 드라이버가 소비. 매칭·보간·키프레임 10테스트 |
| M21 | 슬라이드 마스터/레이아웃 | 공유 배경·플레이스홀더·레이아웃 상속, 마스터 편집 | ✅ `core/master.ts` — 순수 read/compute + 순수 비파괴 편집 op. `SlideMaster`(공유 객체 + `placeholder` 키 슬롯), `Slide.masterId`/`SlideObject.placeholder`/`SlideDocument.masters` 모델 추가. `resolveSlideObjects(doc,i)`: 마스터 객체를 슬라이드 최소 zIndex 아래 band로 정규화해 뒤에 깔고(배경/장식), 채워진 placeholder는 마스터 슬롯을 억제하며 슬라이드 객체가 미설정(createObject 기본값) 기하만 상속·명시 설정은 보존. 편집 op `addMaster/updateMaster/removeMaster`(참조 슬라이드 detach)/`setSlideMaster`/`masterFromSlide`(deep-copy) 모두 새 doc 반환(커맨드 레이어 경유·undo). 라운드트립 무손실: export가 `data-sc-masters`(body JSON)·`data-sc-master`(section)·`data-sc-ph`(객체)를 마스터 보유 덱에만 stamp(마스터 없는 덱 바이트 무변경), importDeckDocument가 parseDocument 검증 경유 복원. master 11 + 라운드트립 1 테스트(전체 224 통과). 정적 standalone은 슬라이드 자체 객체를 렌더하고 마스터 합성은 라이브 `resolveSlideObjects`가 담당(에디터 UI 배선은 후속) |
| M22 | 발표자 보기 | presenter view(현재+다음 슬라이드·노트·경과 타이머), 듀얼 윈도우 | ✅ `core/presenter.ts` — 순수 read-only(문서 미변형·커맨드 불필요·라운드트립 무관). `presenterView(deckState)`: 오디언스 DeckState→발표자 화면 모델(current/next 슬라이드·notes·1-based 슬라이드번호·빌드 position/count·slideComplete) 순수 파생이라 듀얼윈도우 드라이버가 매 네비게이션마다 재계산. `TimerState` 경과 시계 리듀서(startTimer/createTimer/pauseTimer/resumeTimer/resetTimer/elapsedMs/formatElapsed) — 시간은 `now` 인자로 주입(월클럭 미접근)해 결정론적·테스트 가능, pause가 진행분을 accumulated에 접고 resume이 이어감, 음수 클램프, `H:MM:SS`/`M:SS` 포맷. 13테스트(전체 237 통과). 듀얼 윈도우 DOM 드라이버는 후속(브라우저 배선) |
| M23 | 접근성·터치·성능 | ARIA/키보드 내비, 터치 제스처(이동/핀치 리사이즈/회전), 대량 객체 렌더 성능 | ⬜ 미착수 |
| M24 | 제품화 | README + API 문서 + 사용 예제, npm 패키징/배포 메타, 데모 사이트 | ⬜ 미착수 |
| M25 | `.pptx` I/O (최후순위 확장) | OOXML 기반 가져오기/내보내기 — 가능한 범위에서 객체/텍스트/도형 매핑 | ⬜ 미착수 |

## 에이전트 운용 방침

- **드래프팅(코어 구현)은 메인 에이전트가 단일 패스** — 헌법 §6 준수.
- **서브에이전트는 읽기 전용 렌즈/검증으로만**: (a) 마일스톤 완료 시 qa-reviewer 격리 검증, (b) 복잡한 알고리즘(스마트 가이드/스냅 M4, morph M11) 설계 시 Plan 렌즈.
- 팀 병렬은 직교 모듈이 동시 필요할 때만(예: M6 도형엔진 ∥ M11 애니메이션엔진).
