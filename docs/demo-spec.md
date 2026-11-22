# 퓨믹스 데모 개발 명세서 (v2)

> 2026-11-20 · 팀 CODEBLUE · **팀 저장소 기준본** (이 파일을 고치면 단톡방에 알린다)
> v2 (2026-11-20 밤): `README.md` 2절의 **두 페이지 실시간 연결**과 심사위원 관점 검토(예상 57점) 반영. 이벤트 이름과 생존 확인은 팀원 구현(`demo/js/relay.js`, `5acb354`)에 맞췄다. v1은 명세서 검증 리뷰 15건 반영본.
> 진행 상태는 `STATE.md`, 이어받는 법은 `HANDOFF.md`.
> **11-21 결정(사용자)**: ① 서비스명 PUMIX(퓨믹스) ② 시연은 노트북 한 화면(왼쪽 기기 + 오른쪽 아이폰 틀 앱) ③ **서늘 구역 없음 — 기기는 12칸 모두 같은 조건이고 칸 안 습도만 관리**(칸 배정은 빈 칸 중 가장 작은 번호, 화면에 온도 표시 없음). 아래 본문의 서늘 구역·❄·온도 표기는 이 결정이 우선한다.

오늘 밤(11/20 23:00 ~ 11/21 03:00, 뼈대는 22:00 전에 준비) 스마트소프트웨어과 3명이 만드는 반응형 웹 데모의 범위, 구조, 데이터, 작업 분담을 정한다. 서비스 기획은 `docs/서비스-기획서.md` v2.2를 따르고, 이 문서는 무엇을 어떻게 만들지만 다룬다.

## 1. 한눈에

오늘 밤 만들 것은 "휴대폰 앱에서 누르면 프로젝터 속 기기가 움직이는 데모"다. 앱 페이지와 기기 페이지를 따로 만들어 실시간으로 잇고, 인터넷이 없을 때는 노트북 한 대에서 두 페이지를 나란히 띄우는 분할 모드로 돌린다. 데이터는 전부 가상이다.

**만들 것**

- 앱 페이지 `app.html`: 휴대폰 앱(하단 탭 5개). 상태의 유일한 원천
- 기기 페이지 `device.html`: 3D 디스펜서(12칸 원판, 가운데 투입통, 구성원 버튼 4개, 파우치 배출). 받은 상태대로 그리기만 한다
- 분할 모드 `index.html`: 두 페이지를 한 화면에 나란히 (오프라인·리허설·녹화용)
- 연결 레이어 `relay.js`: 정해진 이벤트만 상대 페이지로 옮긴다

**만들지 않을 것**: 로그인, 서버·DB(Supabase는 신호 중계만, 테이블 없음), 실제 워치·인바디 연동, 실제 하드웨어, 결제, 공공데이터 실시간 호출(필요한 값은 JSON으로 미리 넣는다)

**성공 기준**

1. 데모 시나리오(14절)를 새로고침 없이 2분 안팎에 끝까지 클릭할 수 있다. 분할 모드와 휴대폰 모드 둘 다
2. 인터넷이 끊겨도 분할 모드로 완주한다 (라이브러리 로컬 사본, LLM은 미리 받은 결과로 대체)
3. **심사위원이 프로젝터에서 앱 화면(경고·근거)을 볼 수 있다** (3절 발표 구성)
4. 휴대폰에서 누른 뒤 1초 안에 기기가 반응한다 (휴대폰 모드, Should)
5. 2일차 제출용 시연 영상을 녹화해 둔다

**꼭 지킬 규칙 (대회 규칙 + 안전)**

- 실제 인물·환자 정보, 실제 브랜드 제품명을 쓰지 않는다. 제품명은 "데일리 멀티비타민(가상)"처럼 만든다
- 진단·처방·효능 추천으로 읽힐 문구를 쓰지 않는다. 'AI' 표기는 AI가 실제로 한 일에만 붙인다 (12절)
- 두 페이지 하단에 "모든 인물·제품·수치는 가상입니다"를 작게 고정한다

## 2. 범위

데모 장면에 직접 나오는 기능만 Must로 둔다. 기획서 P0 중 STOR-02·DISP-05·MED-01을 Should/Could로 내리고, 데모 전용 연결(REL-01)과 상담용 복용 목록(SAFE-08)을 Must로 올린 제안이다. 팀이 22:00 전에 확정한다(16절). 담당 A=기기·연결, B=앱 화면, C=데이터·엔진(13절).

| 우선 | 기능 ID | 내용 | 화면 | 담당 |
| --- | --- | --- | --- | --- |
| Must | REL-01 (데모 전용) | `relay.js` 통로 ②(BroadcastChannel) + 메시지 형식 + `device:hello`↔`state:sync` + 분할 모드 `index.html` | 전체 | A |
| Must | STOR-01 | 투입 → 빈 칸(보관 조건 맞는 칸) 배정 → 기기 페이지 회전·이송 애니메이션 | S3 + 기기 | A·C |
| Must | REG-01, REG-03 | 영문 해외 직구 라벨 → AI 인식 카드 3단계(라벨 원문 → AI가 정리한 값 → 확인 필요 표시) → 사용자 확인 → 저장. 결과는 실제 비전 LLM이 라벨을 한 번 읽은 응답을 `ocr-mock.json`에 저장해 쓴다 | S2 | B (응답 저장은 C) |
| Must | SAFE-01, 02, 03, 05 | 구성원별 성분 합계·중복·상한 대비 %·근거 펼치기 | S5 | C |
| Must | SAFE-06 | 알레르기 성분 대조 | S5, S7 | C |
| Must | SAFE-04 | 먹는 약과 위험 조합 경고 (약은 미리 등록된 가상 데이터) | S5, S7 | C |
| Must | SAFE-08 (신규) | 상담용 복용 목록: 약사·의사에게 보여 줄 한 화면(제품, 성분 합계, 먹는 약, 알레르기, 경고 근거) | S11 | B |
| Must | FAM-01, 02, 03 | 구성원 4명, 조합 저장(저장 시 안전 검사), 버튼 하나로 배출 | S7 + 기기 버튼 | B·A |
| Must | DISP-01, 02, 03 | 회차 계산, 파우치 라벨(기기 페이지 파우치에 이름·날짜·회차), 배출 애니메이션 | 기기 + S7 | A·B |
| Must | STOR-04, INSIGHT-02 (남은 일수 계산만) | S1 "곧 떨어지는 제품"(남은 14일 이하), 장면 8의 소진 문장 | S1, S10 | C |
| Must | HEALTH-01 | 홈 대시보드 | S1 | B |
| Must | HEALTH-02, 03 | 엄마 실외 운동 시간 30일 그래프 1개 + 숫자 카드, 영양 정보 카드 1개(G01) | S9 | C |
| Must | INSIGHT-01 | 복용 패턴 요약 문장 (규칙으로 계산) | S10 | C |
| Should | REL-02 (데모 전용) | 통로 ①(Supabase Realtime) + 배포 주소로 휴대폰 접속 + 연결 상태 점 | 전체 | A |
| Should | REG-01 실시간 | 실시간 LLM 라벨 인식 (노트북 로컬에서만, 5초 안에 답이 없으면 저장한 결과) | S2 | C |
| Should | SAFE-09 (신규) | 경고 카드 "쉬운 말로 보기": LLM으로 미리 만든 설명, 보건 팀원 검수분만 표시 | S5 | C |
| Should | FAM-05 (신규) | 구성원 카드에 정보 공유 동의 표시 | S7 | B |
| Should | STOR-02 | 칸 클릭 시 제품·잔량·습도·온도 | S4 + 기기 | A·B |
| Should | DISP-02 (화면) | S8 파우치 미리보기 화면 | S8 | B |
| Should | MED-01 | 약 사진 등록 (미리 준비한 결과) | S6 | C |
| Could | REL-03 (데모 전용) | 기기 페이지 대기 화면에 앱 주소 QR | 기기 | A |
| Could | DISP-05, 06 | 여행·출장 모드, 여행 전 점검 | S8-1 + 기기 | A·B |
| Could | SAFE-07 | 섭취 대상 확인 (성인용 제품 → 16세) | S5 | C |
| Could | HEALTH-03 (G02) | 도윤 골격근량 관련 안내 | S9 | C |
| Could | — | 768px 미만 넓은 화면용 배치 다듬기 | 전체 | B |

이번에 하지 않음: REG-02 실시간 공공데이터 매칭, STOR-03 이상 알림, HEALTH-04 실연동, DISP-04·07, LINK 전체(보류), 설정 화면.

## 3. 화면 배치와 발표 구성

| 주소 | 화면 | 쓰는 곳 |
| --- | --- | --- |
| `app.html?room=<코드>` | 앱. 휴대폰이면 전체 화면, 넓은 화면이면 폰 프레임(논리 390×844, `transform: scale()`) 안 | 발표자 휴대폰 |
| `device.html?room=<코드>` | 기기(3D 디스펜서만). 연결 전에는 "앱 연결을 기다리는 중 · 방 코드" 대기 화면 | 발표 노트북 → 프로젝터 |
| `index.html` | 분할 모드: 왼쪽 기기 60% / 오른쪽 앱 40%를 `<iframe>` 두 개로. 같은 브라우저라 통로 ②만으로 연결 | 오프라인·리허설·녹화 |

**발표 구성 (심사위원이 앱 화면을 보게 하는 법)**: 이 서비스의 핵심인 경고·근거·상담용 목록은 앱 화면에 뜬다. 휴대폰만 쓰면 심사위원은 기기만 보게 된다.

1. 기본: 프로젝터 왼쪽에 `device.html`, 오른쪽에 **휴대폰 화면 미러링 창**을 띄운다. 발표자는 휴대폰을 조작하고, 심사위원은 두 화면을 같이 본다
   - 안드로이드: 노트북에 scrcpy 설치, USB 디버깅 켜고 케이블 연결
   - 아이폰: Mac의 QuickTime Player → 새로운 동영상 녹화 → 카메라를 iPhone으로 선택 (케이블)
2. 대체: 미러링이나 와이파이가 안 되면 노트북에서 분할 모드 `index.html`로 같은 시나리오를 진행한다
3. 미러링 방법은 22:00 전에 발표 노트북과 휴대폰 조합으로 한 번 시험한다(16절)

| 화면 폭 | 앱 페이지 배치 |
| --- | --- |
| 768px 미만 (휴대폰) | 폰 프레임 없이 앱 화면을 꽉 채움 |
| 768px 이상 | 가운데 폰 프레임 안에 표시 |

상단 바(앱): 서비스명, 방 코드, 연결 상태 점, [시나리오 초기화]. 초기화는 상태를 처음(제품 8개, 유산균 미등록)으로 되돌리고 기기 페이지도 처음으로 돌린다(6절 `scenario:reset`). 리허설을 여러 번 하려면 꼭 필요하다.

## 4. 기술 스택과 폴더 구조

빌드 없는 정적 웹(HTML + CSS + JS ES 모듈)을 제안한다. 3명이 각자 자기 파일만 고치면 되고, 설치·빌드 문제로 시간을 쓰지 않는다. 엔진·store·relay는 이미 이 방식으로 만들어져 있다(`5acb354`). React에 익숙한 사람이 더 많으면 Vite + React로 바꿔도 되지만 22:00 전에 정한다.

- 3D: three.js + OrbitControls / 그래프: Chart.js / 실시간: supabase-js. 버전은 하나로 고정한다(예: three 0.171.0, Chart.js 4.4.1, supabase-js 2.x 한 버전). 팀 구현은 three.js 0.160(`vendor/` 로컬 사본, `three.core.js` 불필요)이고, 그래프는 Chart.js 대신 인라인 SVG로 그렸다(오프라인·용량)
- 처음에는 CDN으로 시작해도 되지만, 발표 전에 `demo/vendor/`에 로컬 사본을 두고 경로를 바꾼다 (발표장 와이파이 대비)
- 사진 인식·요약 문장: 기본은 `data/ocr-mock.json` 등 미리 받은 결과다. 실시간 LLM 호출은 노트북 로컬에서만 켜고, 키는 `js/config.local.js`(Git 제외)에 둔다. 배포본에서는 끈다(브라우저에 키가 드러나므로)
- 실행: `cd demo && python3 -m http.server 8000` → http://localhost:8000/index.html . `file://`로 열면 ES 모듈이 막힌다. `npx serve`(`npm start`)는 처음 실행 때 패키지를 내려받아 오프라인이면 실패할 수 있다
- 테스트: `cd demo && npm test` (Node 22+, 설치할 패키지 없음, 엔진·relay 테스트 24개). 30일치 기록·건강 데이터 다시 만들기: `npm run gen-data`
- 상태는 앱 페이지 메모리에만 둔다. localStorage는 쓰지 않는다(새로고침 = 초기화)

**오프라인에서 터지는 함정**

- three.js r171부터 `three.module.js`가 `./three.core.js`를 불러온다 → `vendor/three/`에 두 파일을 함께 둔다
- `OrbitControls.js`는 `from 'three'`로 불러오므로 로컬 사본을 써도 importmap이 꼭 필요하다
- Chart.js의 ESM 빌드(`dist/chart.js`)는 `@kurkle/color`를 따로 불러온다 → `<script src="vendor/chart.umd.js">`로 넣고 전역 `Chart`를 쓴다
- supabase-js의 ESM 빌드도 하위 패키지를 따로 불러온다 → `dist/umd/supabase.js`를 `<script>`로 넣고 전역 `supabase.createClient`를 쓴다. 팀 구현의 `startRelay`가 이 방식이다: `vendor/supabase.js`가 있으면 전역 `supabase.createClient`를 쓰고, 없으면 통로 ②만 쓴다

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three/three.module.js",
               "three/addons/": "./vendor/three/addons/" } }
</script>
```

```
demo/
  index.html            분할 모드 (iframe 두 개, ?relay=local)       B
  app.html              앱 페이지 (휴대폰)                           B
  device.html           기기 페이지 (프로젝터)                        A
  css/style.css                                                   B
  js/main-app.js        데이터 로드 → store 초기화 → 화면·relay 마운트  C
  js/main-device.js     relay 연결 → device:hello → 기기 마운트        A
  js/store.js           상태 + 이벤트 버스 (상태의 유일한 원천)        C
  js/relay.js           두 페이지 연결 (통로 ①②, 메시지 형식)          A
  js/config.js          SUPABASE_URL·ANON_KEY (비우면 통로 ②만)        A
  js/config.local.js    LLM 키 등 비밀 값 (Git 제외)                   C
  js/device/device3d.js 3D 기기                                       A
  js/device/device2d.js 대체안: SVG로 위에서 본 기기, 같은 함수         A
  js/app/app.js         폰 프레임, 탭 전환                            B
  js/app/screens/       home register assign myslots safety meds
                        family pouch health insight consult (.js)  B·C
  js/engine/            safety schedule slots insight guide
                        text(문구 틀·조사) (.js)                    C
  data/                 products members meds slots presets health
                        logs limits interactions guide-rules
                        ocr-mock copy (.json)                      C
  tests/                safety engines relay (.test.mjs), helpers   C
  tools/gen-data.mjs    health.json·logs.json 생성 (시드 고정)        C
  package.json          npm test · npm run gen-data · npm start     C
  assets/labels/        가상 라벨 SVG 2장 (영문 직구 유산균, 약)        B
  vendor/               three.module.js·three.core.js·addons,
                        chart.umd.js, supabase.js (UMD)            A
```

**Git 규칙**

1. 각자 자기 담당 폴더만 고친다. 공용 파일(`index.html`, `app.html`, `device.html`, `store.js`, `relay.js`, `data/`)은 고치기 전에 단톡방에 말한다
2. 30분마다 합친다. 합치기 전 분할 모드가 뜨는지만 확인한다
3. 02:30 이후에는 기능을 추가하지 않고 버그만 고친다
4. 팀 저장소 푸시·배포는 팀장이 하라고 할 때만 한다

## 5. 구조도

휴대폰 앱이 상태를 갖고, 기기 페이지는 받은 대로 그린다. 두 페이지는 서로의 코드를 부르지 않고 relay가 정해진 이벤트만 옮긴다.

```
 ┌──────────── 휴대폰 · app.html ────────────┐          ┌──── 노트북·프로젝터 · device.html ────┐
 │ 화면 S1~S11 (B)                            │          │ device3d.js / device2d.js (A)        │
 │   │ bus.emit / on                          │          │   │ 애니메이션만, 상태 없음             │
 │ store.js (C) ── 상태의 유일한 원천           │          │ bus                                   │
 │   │ checkMember() 등 호출                    │          │   │                                   │
 │ engine/ (C) safety·schedule·slots·         │          │                                       │
 │             insight·guide·text             │          │                                       │
 │   │                                        │          │                                       │
 │ relay.js (A) ──── 앱→기기 6개 (6절 목록) ──────────────────────────▶ relay.js (A)          │
 │              ◀─── 기기→앱 5개 (6절 목록) ────────────────────────                          │
 └──────┬─────────────────────────────────────┘          └───────┬───────────────────────────────┘
        │  ① Supabase Realtime broadcast (다른 기기끼리, 인터넷 필요, Should)   │
        │  ② BroadcastChannel (같은 브라우저 탭·iframe끼리, 오프라인, Must)     │
        └───────────────────────────────────────────────────────────────────────┘

 분할 모드 index.html = [ iframe: device.html | iframe: app.html ]  → 통로 ②만 사용
 LLM API (Should): 노트북 로컬에서만, engine/등록 화면이 호출, 실패하면 ocr-mock.json
```

## 6. 이벤트 계약

화면 코드는 한 페이지일 때처럼 `bus.on` / `bus.emit`만 쓴다. 다른 페이지로 넘어갈 이벤트는 relay가 알아서 옮긴다(아래 표 "넘김" 칸). 이 표는 22:00 전에 3명이 합의하고, 바꾸려면 단톡방에 먼저 말한다.

```js
// store.js
export const bus = {
  on(name, fn) { ... },      // 구독
  emit(name, payload, meta) { ... } // 발행. relay가 원격에서 받은 것은 meta.remote = true
};
export const store = { state, set(path, value), subscribe(fn) };
```

| 이벤트 | 보내는 쪽 | 받는 쪽 | 넘김 | 페이로드 | 결과 |
| --- | --- | --- | --- | --- | --- |
| `product:registered` | S2 등록 | store | 안 넘김 | `{ product, memberId }` | products에 추가, `presets[memberId]`에 `{ productId, count: servingCount }` 추가, 안전 미리보기 |
| `device:load` | S3 칸 배정 | 기기 | 앱→기기 | `{ productId, slot }` | 뚜껑 열림 → 원판 회전 → 이송 → 뚜껑 닫힘 |
| `device:loaded` | 기기 | store·S3 | 기기→앱 | `{ productId, slot }` | slots 갱신(`remaining = packageCount`), 문구 1 |
| `device:dispense` | S7 · S8 · `device:button` 처리 | 기기 | 앱→기기 | `{ memberId, round, items: [{ slot, count }], label }` | 칸 차례로 회전·배출 → 밀봉 → 파우치 |
| `device:dispensed` | 기기 | store·앱 | 기기→앱 | `{ memberId, round, at }` | 잔량 차감, logs 추가, 토스트 "아빠 1회차를 배출했어요"(화면은 그대로) |
| `device:button` | 기기 (구성원 버튼) | 앱 | 기기→앱 | `{ memberId }` | 오늘(11/21) 아직 안 낸 가장 작은 회차로 `device:dispense`. 다 냈으면 "오늘 n회차는 이미 배출했어요" |
| `device:slotSelected` | 기기 (칸 클릭) | 앱 | 기기→앱 | `{ slot }` | S4에서 해당 칸 카드 강조, 칸 정보 말풍선 |
| `ui:selectSlot` | S4 내 영양제 | 기기 | 앱→기기 | `{ slot }` | 해당 칸 강조 |
| `device:travel` (Could) | S8-1 여행 | 기기 | 앱→기기 | `{ memberId, pouches: [{ round, date, items, label }] }` | `dispenseMany(pouches)` |
| `scenario:reset` | 상단 바 | store·기기·앱 | 앱→기기 | `{}` | store: 시작 JSON을 `structuredClone`으로 복구 / 기기: 큐 비우기·애니메이션 중단·원판 0° / 앱: 홈 탭·엄마 칩·모달 닫기. 이어서 `state:sync` |
| `state:sync` | 앱 | 기기 | 앱→기기 | `{ slots, products, members, scenarioDate }` | 처음이면 `init`, 이후 `updateSlots`. 기기가 움직이는 중이면 마지막 값만 들고 있다가 동작이 끝난 뒤 반영 |
| `device:hello` | 기기 | 앱 | 기기→앱 | `{}` | 기기 페이지가 열릴 때와 그 뒤 5초마다(생존 확인, 7절) → 앱이 `state:sync`로 답함 |

- 넘기는 이벤트 목록 (`demo/js/relay.js`의 `RELAY_EVENTS`). 앱 페이지는 앞의 6개만, 기기 페이지는 뒤의 5개만 내보내고, 목록에 없는 이벤트는 옮기지 않는다. 앱→기기 명령도 `device:`로 시작하므로 방향은 이름이 아니라 이 목록으로 정한다
  - 앱 → 기기: `device:load` · `device:dispense` · `ui:selectSlot` · `device:travel` · `scenario:reset` · `state:sync`
  - 기기 → 앱: `device:loaded` · `device:dispensed` · `device:button` · `device:slotSelected` · `device:hello`
- 동시 실행: 기기는 움직이는 동안 들어온 명령(`device:load`·`device:dispense`·`device:travel`)을 큐에 쌓아 차례로 처리한다. 앱은 `device:dispense`를 보낸 뒤 `device:dispensed`가 올 때까지 배출 버튼과 기기 버튼 처리를 잠근다(연타로 잔량이 두 번 빠지지 않게)
- 앱이 `state:sync`를 보내는 때: `device:hello`를 받을 때마다(기기가 5초마다 보내므로 5초에 한 번꼴, 7절), 그리고 `device:loaded`·`device:dispensed`·`product:registered`·`scenario:reset` 직후

## 7. 두 페이지 연결 (relay)

`README.md` 2절의 설계와 팀원 구현 `demo/js/relay.js`(테스트 6개)를 기준으로 한다. 화면 쪽에서 쓰는 함수는 `startRelay({ bus, role: 'app' | 'device', config })` 하나이고, `{ room, mode, peerStatus(), onStatus(fn), close() }`를 돌려준다(`mode`: `remote` = 통로 ①까지 켬, `local` = 통로 ②만).

**메시지 형식** (relay끼리만 쓰고 화면 코드는 몰라도 된다)

```js
{ v: 1, id: crypto.randomUUID(), from: "app" | "device",
  name: "device:dispense", payload: { ... }, at: Date.now() }
```

받는 쪽 규칙(`acceptEnvelope`): ① `v`가 1이 아니거나, `from`이 상대 역할이 아니거나, `name`이 상대 역할의 목록(6절)에 없으면 버린다 ② 이미 받은 `id`면 버린다(두 통로로 같은 메시지가 와도 한 번만) ③ 통과하면 `bus.emit(name, payload, { remote: true })`. relay는 `remote`가 붙은 이벤트를 다시 내보내지 않는다(무한 반복 방지)

**통로 두 개**

| 통로 | 언제 | 특징 |
| --- | --- | --- |
| ① Supabase Realtime broadcast (Should) | `config.js`에 주소·키가 있고 인터넷이 될 때 | 휴대폰 ↔ 노트북처럼 다른 기기끼리. 테이블 없이 신호만 |
| ② BroadcastChannel (Must) | 항상 | 같은 브라우저의 탭·iframe끼리. 인터넷 없이 동작 |

- 보낼 때는 켜진 통로 모두에 보내고, 받을 때는 `id`로 중복을 지운다
- 채널 이름 `pumix:<방 코드>`. 방 코드는 `?room=` 값(영문 소문자·숫자·하이픈, 없으면 `demo`). 발표 직전에 바꿔 다른 팀과 섞이지 않게 한다. 방 코드는 섞임 방지일 뿐 보안 장치가 아니다
- **분할 모드는 `?relay=local`로 통로 ②만 쓴다.** 휴대폰 앱이 같은 방에 있으면 앱이 둘이 되어 상태가 갈라지므로, 한 방에는 앱 페이지를 하나만 연다
- Supabase 연결:
  ```js
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ch = client.channel(`pumix:${room}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'bus' }, ({ payload }) => receive(payload));
  ch.subscribe(status => setStatus(status));   // 'SUBSCRIBED' → 연결됨
  ch.send({ type: 'broadcast', event: 'bus', payload: envelope });
  ```

**생존 확인과 연결 점**

- 기기 페이지의 relay가 5초마다(`connectRelay`의 `heartbeatMs` 5000) `device:hello`를 보내고, 앱은 받을 때마다 `state:sync`로 답한다(답장은 앱 쪽 `js/app/app.js`에서 만든다). 따로 ping 신호는 없다
- 연결 점은 `peerStatus()` 값으로 그린다: 🟢 `remote` 최근 10초(`peerTimeoutMs` 10000) 안에 통로 ①로 상대 메시지를 받음 / 🔵 `local` 통로 ②로만 받음 / ⚪ `none` 10초 동안 아무것도 못 받음. 바뀔 때마다 `onStatus(fn)`이 불린다
- 회색이었다가 다시 이어지면 다음 `device:hello`에 앱이 `state:sync`로 답하므로 따로 처리할 것이 없다

**막힘 방지**

- 앱: `device:dispense`·`device:load`를 보내고 15초 안에 완료 이벤트가 없으면 잠금을 풀고 "기기 응답이 없어요. 기기 화면을 확인하세요"를 띄운다. 이때 잔량은 줄이지 않는다
- 기기: 앱이 연결돼 있지 않으면(회색) 구성원 버튼을 눌러도 "앱이 연결되지 않았어요"만 잠깐 보이고 아무것도 하지 않는다(조합을 아는 건 앱뿐)

**설정과 키**

```js
// demo/js/config.js
export const SUPABASE_URL = '';      // 비워 두면 통로 ②만 사용
export const SUPABASE_ANON_KEY = '';
```

- Supabase 무료 프로젝트 하나에서 `Project URL`과 `anon public` 키만 쓴다. 테이블은 만들지 않는다. anon 키를 `config.js`에 넣어 커밋할지는 열린 결정(16절)
- LLM API 키 같은 비밀 키는 절대 커밋하지 않는다

**휴대폰에서 여는 방법**: 발표 때는 배포 주소(Vercel 또는 GitHub Pages, 루트 `demo/`)가 안전하다. 같은 와이파이로 노트북에 직접 붙는 방법(`http://<노트북 IP>:8000/app.html`)은 개발 중에만 쓴다. 공용 와이파이는 기기끼리 접속을 막는 경우가 많다. 배포는 팀장이 하라고 할 때 한다.

**만드는 순서**

| 순서 | 할 일 | 확인 |
| --- | --- | --- |
| 1 | 메시지 형식·검사·중복 제거 + 통로 ② | 같은 브라우저 두 탭에서 `device:dispense` 전달. 이상한 메시지는 무시 (구현·화면 확인 완료) |
| 2 | `device:hello` ↔ `state:sync`(5초 주기), 연결 점 | 기기 탭을 나중에 열어도 칸이 그려짐. 앱 탭을 닫으면 10초 뒤 회색 |
| 3 | 분할 모드 `index.html` (`?relay=local`이면 통로 ①을 켜지 않음, 구현됨) | 인터넷 끄고 분할 모드에서 시나리오가 끝까지 돈다 (01:00 1차 통합은 장면 0~7) |
| 4 | 통로 ① Supabase (Should) | 휴대폰 ↔ 노트북 1초 안에 반응. 와이파이를 끄면 분할 모드는 계속 동작 |
| 5 | 배포 + 미러링 리허설 (Should) | 실제 휴대폰으로 완주, 버튼 연타 때 순서대로 처리 |

## 8. 3D 기기 명세 (기기 페이지)

외부 3D 모델 없이 three.js 기본 도형(원기둥, 부채꼴, 구)만으로 만든다. 모든 동작 함수는 Promise를 돌려주고, 끝나면 6절의 완료 이벤트를 발행한다. 기기 페이지는 상태를 갖지 않고 `state:sync`로 받은 값만 그린다.

**형상** (위에서 본 모습, ❄ = 서늘 구역, ▼ = 배출구)

```
                    [12]
          [11]              [ 1]
     [10]                        [ 2]
     [ 9]      ( 가운데 투입통 )    [ 3]
     [ 8]                        [ 4❄]
          [ 7]              [ 5❄]
                    [ 6❄]
                      ▼  배출구·파우치 출구 (앞면)
          [엄마] [아빠] [도윤] [서윤]  구성원 버튼 (state:sync의 members로 그림)
```

- 몸통: 원기둥. 위쪽에 12칸 원판(30°씩 부채꼴, 칸 사이 벽), 가운데 투입통(뚜껑 있음)
- 칸 번호: 12시 = 12번, 시계 방향으로 1~11번. 칸 4·5·6은 서늘 구역(파란 반투명) [제안]
- 배출구는 6시 방향에 고정. 투입·배출 모두 원판을 돌려 대상 칸을 6시 자리로 가져온 뒤 동작한다
- 칸 안 알약: 작은 구·캡슐 모양, 잔량 비율대로 최대 20개까지만 표현(성능)
- 카메라: 위에서 비스듬히 45°, OrbitControls. 대기 중 천천히 자동 회전, 동작 중에는 멈춤. 프로젝터에서 보이게 기기를 화면의 70% 크기로
- 저사양 노트북 대비: 그림자 끄기, 안티에일리어싱은 성능 보고 결정
- 화면 구석: 연결 점, 방 코드. 연결 전에는 대기 화면(Could: 앱 주소 QR)

**함수** (`device3d.js`와 `device2d.js`가 똑같이 내보낸다)

| 함수 | 하는 일 | 대략 시간 |
| --- | --- | --- |
| `init(container, slots, members)` | 기기 그리기, 칸별 제품·잔량 표시, 구성원 버튼 | — |
| `highlightSlot(n)` | 해당 칸 빛나게, `null`이면 해제 | 즉시 |
| `rotateTo(n)` | n번 칸을 6시 자리로 (가까운 방향) | 0.8초 |
| `load(productId, n)` | 뚜껑 열림 → `rotateTo(n)` → 알약이 가운데에서 칸으로 이동 → 뚜껑 닫힘 | 약 2.5초 |
| `dispense(items, label)` | 칸마다 `rotateTo` → 개수만큼 알약 떨어짐 → 밀봉 → 라벨 붙은 파우치가 앞으로 나옴 | 칸당 1.1초 + 1.2초 |
| `dispenseMany(pouches)` (Could) | 여러 파우치를 연결 띠로 | — |
| `updateSlots(slots)` | 잔량·색 다시 그리기 (움직이는 중이면 끝난 뒤) | 즉시 |
| `reset()` | 큐 비우기, 애니메이션 중단, 원판 0° | 즉시 |

- 파우치 라벨은 `CanvasTexture`로 "아빠 · 11/21 1회차"와 내용물을 글자로 그린다
- 칸 클릭은 Raycaster로 잡아 `device:slotSelected`, 구성원 버튼 클릭은 `device:button`을 발행한다

**구현 팁**: Raycaster 좌표는 `canvas.getBoundingClientRect()` 기준으로 계산한다. 드래그 회전과 칸 클릭은 포인터 이동 5px로 구분한다. 파우치 라벨의 한글은 시스템 폰트로 그리고 `texture.colorSpace = THREE.SRGBColorSpace`를 준다.

**막혔을 때**: A는 23:30까지 `device2d.js`를 "1초 뒤 resolve하는 스텁"(같은 함수 이름, 화면에는 칸 번호만 표시)으로 먼저 올린다. B·C는 이 스텁으로 통합을 시작한다. 01:00까지 3D 회전·투입이 안 되면 스텁을 SVG로 위에서 본 원(CSS 회전)으로 완성해 쓴다. 함수 이름이 같아 다른 코드는 바뀌지 않는다.

## 9. 화면 명세 (앱 페이지)

하단 탭은 홈 / 영양제 / 안전 / 가족 / 건강 5개다. 화면 번호는 기획서 6.2절과 같고, 모든 화면 상단에 구성원 칩(엄마·아빠·도윤·서윤)이 있어 누르면 그 사람 기준으로 바뀐다.

| 화면 | 탭 | 보여 줄 것 | 동작 | 우선 |
| --- | --- | --- | --- | --- |
| S1 홈 | 홈 | 오늘 먹을 영양제(회차별), 경고 배지 수, 곧 떨어지는 제품(남은 14일 이하), 건강 요약 카드 3개(걸음·수면·체성분) | 경고 배지 → S5, "등록" → S2 | Must |
| S2 등록 | 영양제 | 앱 안 썸네일로 라벨 고르기(파일 이름이 `ocr-mock.json` 키와 같아야 함) → "AI가 라벨을 읽는 중" 1.5초 → **AI 인식 카드**(아래) + "쓰는 사람" 칩 | 확인 필요 항목을 모두 [맞아요] 또는 [고치기] 해야 [저장]이 켜짐 → `product:registered` → S3 | Must |
| S3 칸 배정 | 영양제 | 배정된 칸 번호와 이유, [가운데 투입통에 넣기] | 버튼 → `device:load` → `device:loaded` 후 문구 1 | Must |
| S4 내 영양제 | 영양제 | 칸별 카드: 칸 번호, 제품, 잔량 막대, 남은 일수, 습도·온도, 쓰는 구성원 | 카드 누르면 `ui:selectSlot` | Should |
| S5 안전 리포트 | 안전 | 성분별 막대(상한 대비 %, 80%·100% 선), 경고 카드(꼭 확인 → 주의 → 참고 순), 근거 펼치기, [상담할 때 보여 줄 목록], 하단 고정 문구. Should: 카드별 "쉬운 말로 보기" | 구성원 전환, 근거 토글 | Must |
| S6 먹는 약 | 안전 | 구성원별 약 목록, 약 사진 등록 → 정보 카드(주의사항·상호작용·보관법 요약) | 등록 시 S5 재계산 | Should |
| S7 가족 | 가족 | 구성원 카드 4개(Should: 정보 공유 동의 표시), 조합 편집(칸 체크 + 개수), 배출 버튼 | 저장 시 안전 검사 → 경고 모달 [상담할 때 보여 줄 목록] [빼고 저장] [그대로 저장]. 배출 → 오늘 아직 안 낸 가장 작은 회차로 `device:dispense` | Must |
| S8 오늘 파우치 | 가족 | 파우치 라벨 미리보기(이름·날짜·회차·내용물), 오늘 배출 기록 | 배출 버튼, 여행 모드 진입 | Should |
| S8-1 여행 | 가족 | 기간 선택 → 봉지 수·라벨 목록 → 잔량 부족·상온 노출 점검 | 한 번에 배출 → `device:travel` | Could |
| S9 건강 | 건강 | 엄마 실외 운동 시간 30일 꺾은선 1개 + 숫자 카드(걸음·수면·체중), 영양 정보 카드 1개 | 카드의 "근거" 펼치기 | Must |
| S10 기록 | 건강(하위 탭) | 구성원별 복용률, 기록 요약 문장(문구 7), 소진 예측(문구 8) | — | Must |
| S11 상담용 복용 목록 (신규) | 안전(하위) | 구성원 이름·나이, 먹는 영양제(제품명·1회·1일), 성분 하루 합계(상한 대비 %), 먹는 약, 알레르기, 경고와 근거 출처, 만든 시각. 큰 글씨, 한 화면 | [크게 보기] (데모: 화면만 키움). 하단 문구 14 | Must |

**AI 인식 카드 (S2)**: 영문 해외 직구 라벨은 공공데이터에 없어서 AI가 읽는 의미가 가장 크다. 카드는 세 단계를 한 화면에 보여 준다.

| 라벨 원문 (영어) | AI가 정리한 값 | 상태 |
| --- | --- | --- |
| Serving Size: 1 Capsule / Take 1 capsule daily | 1회 1캡슐, 1일 1회 | 확인됨 |
| Servings Per Container: 30 | 내용량 30캡슐 | 확인됨 |
| Probiotic Blend 10 Billion CFU | 프로바이오틱스 100억 CFU | **확인 필요** (단위 환산) |
| Allergen Information: Contains Milk | 알레르기 표시: 우유 | 확인됨 |
| Refrigeration recommended after opening | 서늘 보관 → 서늘 구역 배정 | **확인 필요** (보관 조건 해석) |
| For adults | 섭취 대상: 성인 | 확인됨 |

- 카드 머리 문구 12, 하단 문구 13. 노란 "확인 필요" 줄은 [맞아요] / [고치기] 버튼이 있다
- 사용자가 확인하기 전 값은 안전 계산에 쓰지 않는다(11절 규칙 0)
- 표기: 미리 받은 결과면 "AI 인식 결과(미리 받은 결과)", 실시간 호출이면 "AI 인식 결과"

경고 모달의 [그대로 저장]은 막지 않는다. 앱은 판단하지 않고 알려만 주며, 그대로 저장하면 해당 구성원 카드에 주의 표시가 남는다. 데모에서는 [상담할 때 보여 줄 목록]을 한 번 열어 보고 [빼고 저장]을 누른다.

## 10. 데이터 스키마와 가상 데이터

데모 데이터는 전부 가상이며 C가 `data/`에 만든다. 아래 숫자는 데모 장면(14절)이 그대로 나오도록 맞춘 값이다. 상한값은 보건 팀원이 원문을 확인하기 전까지 `verified: false`로 둔다.

**구성원** (`members.json`)

| id | 호칭 | 이름(가상) | 나이 | 알레르기 | 먹는 약 (`meds.json`) | 정보 공유 (Should) |
| --- | --- | --- | --- | --- | --- | --- |
| mom | 엄마 | 최은정 | 52 | — | — | 본인 동의(가상) |
| dad | 아빠 | 이준호 | 55 | — | 항응고제(가상 처방약), `drugClass: "anticoagulant"` | 본인 동의(가상) |
| son | 도윤 | 이도윤 | 24 | — | — | 본인 동의(가상) |
| daughter | 서윤 | 이서윤 | 16 | 우유 | — | 본인 동의(가상, 만 14세 이상) |

**제품과 칸** (`products.json`, `slots.json`) — 시작 상태 8개, 데모 중 유산균 등록으로 9개

| id | 제품명(가상) | 칸 | 구역 | 1회 개수 · 1일 횟수 | 한 알 성분 | 알레르기 표시 | 쓰는 사람 | 잔량 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | 데일리 멀티비타민 | 12 | 건조 | 1정 · 1회 | 비타민D 10µg, 아연 8.5mg, 비타민C 100mg | — | 엄마 | 40 |
| P02 | 비타민D 2000IU (해외 직구) | 1 | 건조 | 1정 · 1회 | 비타민D 50µg | — | 엄마 | 55 |
| P03 | 아연 25 (해외 직구) | 2 | 건조 | 1정 · 1회 | 아연 25mg | — | 엄마 | 48 |
| P05 | 루테인 맥스 | 3 | 건조 | 1캡슐 · 1회 | 루테인 20mg | — | 아빠 | 30 |
| P04 | 오메가3 1000 | 4 | 서늘 | 1캡슐 · 1회 | EPA·DHA 600mg | — | 엄마 | 9 |
| P06 | 마그네슘 250 | 7 | 건조 | 1정 · 1회 | 마그네슘 250mg | — | 도윤 | 50 |
| P07 | 비타민B 컴플렉스 | 8 | 건조 | 1정 · 2회 | 비타민B6 10mg | — | 도윤 | 60 |
| P08 | 틴 멀티비타민 (청소년용) | 9 | 건조 | 1정 · 1회 | 비타민D 5µg, 아연 5mg | — | 서윤 | 45 |
| P09 | Daily Probiotic 10B (해외 직구, 데모 중 등록) | 5 (배정) | 서늘 | 1캡슐 · 1회 | 프로바이오틱스 100억 CFU | 우유 | 엄마 | 30 |

**빈 칸**: 시작 상태는 5·6(서늘)·10·11, 유산균 등록 후에는 6(서늘)·10·11이다. 시작 `slots.json`에 P09를 미리 넣지 않는다(장면 3에서 규칙대로 5번이 배정돼야 한다). 엄마 하루 합계는 비타민D 60µg(10+50), 아연 33.5mg(8.5+25)이 되도록 맞췄다. 도윤은 P07이 1일 2회라 하루 2봉지가 나온다. P09는 `packageCount: 30`이고 투입되면 잔량 30이 된다.

**상한값** (`limits.json`) — 성인(19세 이상) 기준, 출처: 2025 한국인 영양소 섭취기준(보건복지부·한국영양학회, 2025.12.31 배포) [요약표](https://www.kns.or.kr/data/FileRoom/2025123102020340340.pdf)

| key | 성분 | 상한 | 확인 상태 |
| --- | --- | --- | --- |
| vitD | 비타민D | 100µg | 2020판 확인, 2025판은 2차 자료로 확인 |
| zinc | 아연 | 35mg | 2020·2025판 확인 (2025 여자 행은 미확인) |
| vitC | 비타민C | 2,000mg | 2020판 확인, 2025판 미확인 |
| vitB6 | 비타민B6 | 50mg | 2025판에서 100mg → 50mg으로 낮아짐 |
| magnesium | 마그네슘(식품 외 급원) | 350mg | 2020·2025판 동일 |

검증 에이전트가 2020판·2025판 자료와 대조했다(2026-11-20). 보건 팀원이 2025 원문 표로 최종 확인한 뒤 `verified: true`로 바꾼다. 15~18세 상한값(비타민D·아연)은 보건 팀원이 같은 표에서 찾아 넣는다. 넣기 전에는 서윤 화면에서 막대 없이 합계만 보인다(데모에서는 서윤 안전 탭을 열지 않는다).

**파일별 필드**

```json
// products.json (한 개 예시)
{ "id": "P09", "name": "Daily Probiotic 10B(가상)", "form": "캡슐", "origin": "해외 직구",
  "servingCount": 1, "timesPerDay": 1, "packageCount": 30,
  "nutrients": [{ "key": "probiotics", "label": "프로바이오틱스", "amount": 100, "unit": "억 CFU" }],
  "allergens": ["우유"], "storage": "cool", "target": "성인", "confirmed": true,
  "labelText": "Contains Milk / Refrigeration recommended after opening", "expiry": "2027-05-31" }

// ocr-mock.json  (C가 실제 비전 LLM으로 라벨을 한 번 읽은 응답을 정리해 저장)
{ "label-probiotics.svg": {
    "model": "(실제로 쓴 모델 이름)", "capturedAt": "2026-11-20T23:20:00+09:00",
    "rawLines": ["DAILY PROBIOTIC 10B", "Supplement Facts", "Serving Size: 1 Capsule", "..."],
    "fields": {
      "servingCount": { "value": 1, "source": "Serving Size: 1 Capsule", "check": false },
      "timesPerDay":  { "value": 1, "source": "Take 1 capsule daily", "check": false },
      "packageCount": { "value": 30, "source": "Servings Per Container: 30", "check": false },
      "nutrients": [{ "key": "probiotics", "amount": 100, "unit": "억 CFU",
                      "source": "Probiotic Blend 10 Billion CFU", "check": true, "note": "10 Billion = 100억" }],
      "allergens":    { "value": ["우유"], "source": "Allergen Information: Contains Milk", "check": false },
      "storage":      { "value": "cool", "source": "Refrigeration recommended after opening", "check": true,
                        "note": "개봉 후 냉장 권장 → 서늘 구역" },
      "target":       { "value": "성인", "source": "For adults", "check": false } } },
  "med-anticoagulant.svg": { "name": "항응고제(가상)", "drugClass": "anticoagulant", "...": "..." } }

// slots.json
[{ "slot": 1, "zone": "dry", "productId": "P02", "remaining": 55, "humidity": 38, "tempC": 22 }, ...]

// presets.json  (구성원별 저장 조합)
{ "mom": [{ "productId": "P01", "count": 1 }, { "productId": "P02", "count": 1 },
          { "productId": "P03", "count": 1 }, { "productId": "P04", "count": 1 }],
  "dad": [{ "productId": "P05", "count": 1 }],
  "son": [{ "productId": "P06", "count": 1 }, { "productId": "P07", "count": 1 }],
  "daughter": [{ "productId": "P08", "count": 1 }] }

// interactions.json  (식약처 안내 예시만)
[{ "nutrientKey": "epa_dha", "drugClass": "anticoagulant", "level": "danger",
   "reason": "출혈 위험", "source": "식약처 정보그림 뉴스",
   "url": "https://www.mfds.go.kr/brd/m_629/view.do?seq=31" },
 { "nutrientKey": "probiotics", "drugClass": "antibiotic", "level": "caution",
   "reason": "약 효과 저하", "source": "식약처 정보그림 뉴스", "url": "(위와 같음)" }]

// limits.json
[{ "key": "zinc", "label": "아연", "ul": 35, "unit": "mg", "ageMin": 19,
   "source": "2025 한국인 영양소 섭취기준", "verified": false }, ...]

// health.json  (최근 30일)
{ "mom": { "daily": [{ "date": "2026-10-22", "steps": 7200, "sleepH": 6.5, "outdoorMin": 40 }, ...],
           "inbody": [{ "date": "2026-10-24", "weightKg": 58.2, "muscleKg": 21.4, "fatPct": 29.1 }, ...] } }

// logs.json  (배출·복용 기록)
[{ "date": "2026-10-24", "memberId": "son", "round": 1, "taken": false }, ...]

// guide-rules.json  (문구·출처는 보건 팀원)
[{ "id": "G01", "metric": "outdoorMin", "condition": { "type": "dropRatio", "days": 14, "ratio": 0.5 },
   "nutrientKey": "vitD", "showCurrentIntake": true, "text": "(문구 6)", "source": "..." },
 { "id": "G02", "metric": "muscleKg", "condition": { "type": "consecutiveDrop", "points": 4 }, "priority": "Could",
   "nutrientKey": "protein", "supplement": false, "text": "...", "source": "..." }]
```

**기록·건강 데이터에 넣어야 할 패턴**

- 엄마 `outdoorMin`: 앞 16일 평균 약 40분 → 최근 14일 평균 약 12분 (G01이 켜지도록)
- 도윤 인바디: 주 1회 4번, 골격근량 33.0 → 32.8 → 32.6 → 32.4kg (G02, Could)
- 도윤 기록: 최근 4주(10/24~11/20) 주말 8일 중 5일 1회차 `taken: false`
- 나머지 구성원 복용률은 90% 이상
- 오메가3 잔량 9개, 사용자는 엄마 한 명 → "9일 뒤 떨어져요"

30일치 기록·건강 데이터는 손으로 쓰지 말고, 시드를 고정한 생성 함수로 위 패턴을 만든 뒤 JSON으로 저장한다(다시 만들어도 같은 값). `tools/gen-data.mjs`, `npm run gen-data`.

**가상 라벨 SVG (B가 23:30까지)**: `label-probiotics.svg`는 영문 해외 직구 라벨처럼 만든다. 들어갈 줄: "DAILY PROBIOTIC 10B", "Supplement Facts", "Serving Size: 1 Capsule", "Servings Per Container: 30", "Probiotic Blend 10 Billion CFU", "Directions: Take 1 capsule daily with water", "Allergen Information: Contains Milk", "Refrigeration recommended after opening", "For adults", 하단 작게 "가상 제품 · 해커톤 데모". 보건 팀원이 문구를 확인한다. `med-anticoagulant.svg`는 "항응고제(가상) · 처방약 · 가상 데이터"만.

## 11. 안전 엔진 규칙

경고 판단은 전부 규칙으로 하고 AI는 쓰지 않는다. `js/engine/safety.js`는 화면과 상관없는 순수 함수로 만들고, 아래 테스트 4개가 통과해야 화면에 붙인다.

```js
checkMember(memberId, presetItems, state) → Warning[]
// Warning = { type: 'duplicate'|'upper'|'allergy'|'drug'|'age',
//             level: 'danger'|'caution'|'info',
//             title, message,
//             evidence: { source, url?, value?, limit?, labelText? } }
```

**규칙** (위에서부터 차례로)

0. 사용자가 확인하지 않은 제품(`confirmed: false`)은 계산에 넣지 않고 "확인 전" 표시만 한다. AI 인식이 틀려도 사람이 확인하기 전에는 경고에 쓰이지 않는다
1. 합계: 성분 key별로 `amount × count × timesPerDay`를 조합 안 제품만큼 더한다. 성분 key는 `vitD`, `zinc`, `vitC`, `vitB6`, `magnesium`, `epa_dha`, `probiotics`, `lutein`으로 통일한다
2. 중복 (`duplicate`, info): 같은 key가 제품 2개 이상에 있으면
3. 상한 (`upper`): 합계 ÷ 상한. 100% 이상 danger "상한을 넘어요", 80~99% caution "상한에 가까워요", 80% 미만은 경고 없이 막대만. 구성원 나이에 맞는 상한이 없으면 막대 없이 합계만 보이고 경고를 만들지 않는다 [임계값 80%는 제안]
4. 알레르기 (`allergy`, danger): 제품 `allergens`와 구성원 `allergies`가 겹치면
5. 먹는 약 (`drug`): 조합 안 성분 key × 구성원 약의 `drugClass`가 `interactions.json`에 있으면, 그 항목의 level로
6. 섭취 대상 (`age`, info, Could): `target`이 "성인"인데 구성원이 19세 미만이면 "표시사항을 확인하세요". 용량을 대신 정해 주지 않는다

- 표시 순서: danger(빨강) → caution(주황) → info(노랑). 화면에 보이는 등급 이름은 '꼭 확인 / 주의 / 참고'로 하고 '위험'이라는 말은 쓰지 않는다. 모든 경고에 근거(출처, 값, 기준, 표시사항 원문)를 담는다
- 경고가 0개여도 "안전합니다"라고 쓰지 않는다. 하단 고정 문구(12절)만 보인다
- 검사 시점: 조합 저장(S7), 안전 탭 열 때(S5), 새 제품 확인·저장 또는 약 등록 직후

**테스트 케이스** (10절 데이터 기준, 브라우저 콘솔에서 `console.assert`로 확인해도 됨)

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| T1 | 엄마 조합 (P01·P02·P03·P04) | 아연 caution(33.5/35 = 96%), 아연 중복 info, 비타민D 중복 info, 비타민D 막대 60% |
| T2 | 서윤 조합 + P09 | allergy danger "우유" 1개 (SAFE-07을 구현하면 age info 1개 추가) |
| T3 | 아빠 조합 + P04 | drug danger (항응고제 × EPA·DHA) 1개 |
| T4 | 도윤 조합 (P06·P07) | 경고 0개. 마그네슘 막대 71%, 비타민B6 막대 40% (10mg × 2회 / 50mg) |
| T5 | 엄마 조합 + P09(`confirmed: false`) | T1과 같음 + P09 "확인 전" 표시 |

**다른 엔진** (같은 폴더, C 담당)

- `schedule.js`: 구성원 하루 봉지 수 = 조합 제품의 `timesPerDay` 최댓값. n회차 봉지에는 `timesPerDay ≥ n`인 제품만 넣는다 (도윤: 1회차 P06·P07, 2회차 P07)
- `slots.js`: 빈 칸 중 `storage`와 `zone`이 맞는 칸을 번호 작은 순으로. 서늘 칸이 다 차면 건조 칸 + "서늘 구역이 찼어요" 안내. 빈 칸이 없으면 등록을 막는다
- 남은 일수: 잔량 ÷ (모든 구성원의 `count × timesPerDay` 합)
- `insight.js`: 구성원별 복용률, 요일·회차별 놓친 횟수를 계산하고 문장은 템플릿으로 만든다. 숫자는 항상 계산 결과를 쓴다. LLM으로 문장을 다듬었다면 "AI 요약(미리 생성)"으로 표기
- `guide.js`: `guide-rules.json` 조건을 검사해 카드를 만든다. 카드에는 지금 섭취량과 상한 대비 %를 먼저 넣고, 새로 사거나 더 먹으라는 방향의 말은 넣지 않는다
- 상담용 목록(S11): `checkMember` 결과와 조합·약·알레르기를 그대로 모아 보여 준다. 새 판단을 더하지 않는다

## 12. 화면 문구 규칙

화면 문구는 보건행정 팀원이 확정하고, SW는 문구를 `data/copy.json` 한 곳에 모아 바꿔 끼우기 쉽게 만든다. 아래 표의 검수 칸을 보건 팀원이 바꾼다('검수 전' → '확정' 또는 '수정').

**쓰면 안 되는 말**: 추천, (권유하는) 드세요, 효과·효능, 개선, 치료, 예방, 진단, 부족해요(결핍 판단), 안전합니다, 구매 버튼·구매 링크, 실제 브랜드명, 경고 등급 이름으로서의 '위험', "줄이세요"처럼 행동을 지시하는 말, AI가 하지 않은 일에 붙인 'AI'(예: 규칙 경고를 "AI 판단"이라고 부르기)

**항상 붙일 것**: 약·알레르기·영양 정보 카드 끝의 상담 문구, 근거 펼치기 버튼, 경고 화면 하단 고정 문구(9번)

| # | 상황 | 문구 초안 | 검수 |
| --- | --- | --- | --- |
| 1 | 칸 배정 | 유산균은 서늘하게 보관하는 제품이라 5번 칸(서늘 구역)에 넣었어요. | 검수 전 |
| 2 | 중복 | 비타민D가 2개 제품에 들어 있어요. 하루 합계 60µg, 상한의 60%예요. | 검수 전 |
| 3 | 상한 근접 | 아연 하루 합계가 33.5mg으로 상한(35mg)의 96%예요. 제품 표시사항을 확인하고, 필요하면 의사·약사와 상담하세요. | 검수 전 |
| 4 | 알레르기 | 이 제품에는 '우유' 함유 표시가 있어요. 서윤 님 알레르기 정보와 겹쳐요. 표시사항을 다시 확인하고, 걱정되면 의사·약사와 상담하세요. | 검수 전 |
| 5 | 먹는 약 | 아빠가 드시는 항응고제와 오메가3(EPA·DHA)를 함께 드시면 출혈 위험 때문에 주의가 필요해요(식약처 안내). 의사·약사와 상담하세요. | 검수 전 |
| 6 | 건강 기록 관련 영양 정보 | 최근 2주 실외 활동 시간이 줄었어요. 실외 활동과 관련된 비타민D는 지금 두 제품에서 하루 60µg 드시고 있어요(상한 100µg의 60%). 새 제품을 더하기 전에 지금 섭취량을 의사·약사와 확인하세요. | 검수 전 |
| 7 | 기록 요약 | 도윤 님은 최근 4주 동안 주말 1회차를 8번 중 5번 놓쳤어요. | 검수 전 |
| 8 | 소진 예측 | 엄마 오메가3는 9일 뒤 떨어져요. | 검수 전 |
| 9 | 경고 화면 하단 고정 | 표시사항과 공공데이터를 대조한 결과입니다. 경고가 없다고 안전하다는 뜻은 아니며, 걱정되면 의사·약사와 상담하세요. | 검수 전 |
| 10 | 상한 초과 (데모에 안 나옴) | ○○ 하루 합계가 상한의 ○%예요. 표시사항을 확인하고 의사·약사와 상담하세요. | 검수 전 |
| 11 | 영양 정보 카드 제목 | 건강 기록과 관련된 영양 정보 | 검수 전 |
| 12 | AI 인식 카드 머리 | AI가 영어 라벨을 읽고 정리했어요. 노란 항목 2개를 확인해 주세요. | 검수 전 |
| 13 | AI 인식 카드 하단 | 확인하지 않은 값은 성분 확인에 쓰지 않아요. | 검수 전 |
| 14 | 상담용 목록 하단 | 이 목록은 판단이 아니라 상담 자료예요. 약사·의사에게 보여 주세요. | 검수 전 |
| 15 | 연결 안내 | 앱 연결을 기다리는 중 · 방 코드 ○○ / 앱이 연결되지 않았어요 / 기기 응답이 없어요. 기기 화면을 확인하세요. | 검수 전 |
| 16 | 정보 공유 동의 (Should) | 정보 공유: 본인 동의(가상) · 공유 범위: 복용 제품·경고 | 검수 전 |
| 17 | 쉬운 말로 보기 머리 (Should) | AI가 쉬운 말로 다시 쓴 설명이에요 · 보건 팀원 검수 | 검수 전 |

"쉬운 말로 보기" 설명(Should)은 C가 LLM으로 미리 만들고, 규칙의 근거 출처에 없는 내용을 더하지 않는다. 보건 팀원이 검수한 것만 화면에 보인다.

## 13. 작업 분담과 시간표

역할은 기기·연결(A), 앱 화면(B), 데이터·엔진(C) 셋으로 나눈다. 누가 어느 역할을 맡을지는 22:00 전에 이름을 적는다(16절). 22:00~23:00은 5분 스피치(중간 평가) 시간이라 실제 개발은 23:00부터다. relay는 기기 페이지와 붙어 있어 A가 맡는 안을 제안한다(`README.md` 2-11은 C 제안, C가 가장 바빠서 바꿈). 01:00 분할 모드 1차 통합이 가장 중요한 관문이다. 데이터·엔진·store·relay는 이미 구현돼 있다(`5acb354`, 테스트 24개). 무엇이 끝났는지는 `STATE.md`를 본다.

**A · 기기·연결** (담당: ___)

- [ ] 23:30까지 `device2d.js` 스텁 + `relay.js` 통로 ② 골격 push
- [ ] `relay.js`: 메시지 형식·검사·중복 제거, `device:hello`↔`state:sync`, 연결 점 (구현됨)
- [ ] 분할 모드 `index.html` (`?relay=local`)
- [ ] 원판 12칸·투입통·구성원 버튼 4개·배출구 모델링, `rotateTo` / `load` / `dispense` / `reset` (Promise), 명령 큐(`device:load`·`device:dispense`·`device:travel`)
- [ ] 칸 클릭(Raycaster) → `device:slotSelected`, 버튼 → `device:button`, 파우치 라벨 CanvasTexture
- [ ] 01:00까지 3D가 안 되면 2D 완성으로 전환
- [ ] (Should) 통로 ① Supabase, 배포 준비, 미러링 리허설 / (Could) 대기 화면 QR
- [ ] three.js·Chart.js·supabase-js 로컬 사본(`vendor/`)

**B · 앱 화면** (담당: ___)

- [ ] `app.html` 레이아웃, 폰 프레임(넓은 화면)·전체 화면(휴대폰), 하단 탭 5개, 구성원 칩, 상단 바(방 코드·연결 점·초기화)
- [ ] 23:30까지 가상 라벨 SVG 2장 (10절 문구, 영문 직구 유산균)
- [ ] S1 홈
- [ ] S2 등록: 썸네일, AI 인식 카드 3단계, 확인 버튼, 쓰는 사람 칩 → S3 칸 배정
- [ ] S7 가족: 조합 편집, 경고 모달(상담용 목록 버튼 포함), 배출 버튼, 토스트
- [ ] S11 상담용 복용 목록
- [ ] (Should) S4 내 영양제, S8 파우치 미리보기, 정보 공유 동의 표시

**C · 데이터·엔진** (담당: ___)

- [ ] 22:00 전 `store.js` + 이벤트 버스(`meta.remote`) + 빈 함수 뼈대 push
- [ ] 23:30까지 비전 LLM으로 영문 유산균 라벨을 한 번 읽어 `ocr-mock.json` 저장 (키가 없으면 손으로 작성하고 표기를 "미리 입력한 결과"로 바꿈)
- [ ] `data/*.json` (10절 값, 30일치는 시드 고정 생성 함수)
- [ ] `safety.js` + 테스트 T1~T5 통과
- [ ] `schedule.js`, `slots.js`, `insight.js`(남은 일수 포함), `guide.js`, 앱 쪽 `state:sync` 보내기
- [ ] S5 안전 리포트, S9 건강(엄마 그래프 1개 + 숫자 카드), S10 기록
- [ ] (Should) 실시간 LLM 호출(로컬), 쉬운 말로 보기 설명 생성, S6 먹는 약

**보건행정 팀원에게 받을 것**: 12절 문구 17개 검수, 10절 상한값 확인(15~18세 비타민D·아연 포함), 영양 정보 규칙 문구와 출처, 가상 라벨 문구 확인, (Should) 쉬운 말 설명 검수. 발표에서 "보건 팀원이 원문과 대조해 검수했다"고 말할 수 있게 검수 칸을 '확정'으로 채운다.

| 시각 | 목표 | 확인 방법 |
| --- | --- | --- |
| ~22:00 | C 뼈대 push, 이벤트 계약(6절) 합의, Supabase 프로젝트 생성(계정 있는 사람), 미러링 시험 | 3명 모두 같은 분할 모드 화면이 뜬다 |
| 22:00~23:00 | 5분 스피치(중간 평가). 개발 없음 | — |
| 23:00~23:30 | A 스텁·relay 골격 / B 앱 틀·라벨 SVG / C LLM 라벨 인식 저장·엔진 시작 | 분할 모드에서 버튼 → 1초 뒤 스텁 완료 |
| 23:30~00:30 | A hello/sync·분할 모드·3D 시작 / B S1·S2·S7 / C safety T1~T5·S5 | 30분마다 합치기 |
| 00:30~01:00 | A 3D 회전·투입 / B S11 / C S9·S10 | — |
| 01:00 | 1차 통합(분할 모드): 장면 0~7, 3D→2D 판단 | 처음부터 끝까지 클릭됨 |
| 01:00~02:00 | A Supabase·배포 준비(Should) / B Should 화면 / C 문구 반영·Should | 장면 8~9 클릭됨 |
| 02:00~02:30 | 휴대폰 + 미러링 리허설, 버그 | 휴대폰 → 기기 1초 안 |
| 02:30~03:00 | 기능 동결, 리허설 2회(분할 1 + 휴대폰 1), 시연 영상 백업 녹화(분할 모드) | 2분 안팎에 완주 |
| 2일차 09:00~11:00 | 버그 수정만, 오프라인 확인, 최종 녹화, (팀장 지시 시) 푸시·배포 | 와이파이 끄고 분할 모드 완주 |
| 2일차 12:00 전 | 시연 화면·영상 제출 | — |

## 14. 데모 시나리오

발표 시연은 아래 장면 0~9 순서로 약 2분 5초다. 프로젝터 왼쪽은 기기 페이지, 오른쪽은 휴대폰 미러링 창이고, 발표자는 휴대폰을 조작한다(대체: 분할 모드). 괄호 안 문구 번호는 12절 표다. 시나리오 날짜는 2026-11-21로 고정한다.

0. 준비: [시나리오 초기화], 연결 점 초록(분할 모드면 파랑) 확인
1. (10초) 훅: "이 가족 4명은 영양제 8개를 먹습니다. 오늘 엄마가 해외 직구 유산균을 샀는데, 라벨이 영어입니다." 휴대폰 홈, 경고 배지 3
2. (20초) AI 라벨 판독: 영양제 탭 → 등록 → 영문 라벨 썸네일 → "AI가 라벨을 읽는 중" → AI 인식 카드: "Contains: Milk → 우유", "10 Billion CFU → 100억 CFU(확인 필요)", "Refrigeration recommended → 서늘 보관(확인 필요)" → [맞아요] 두 번 → 쓰는 사람 '엄마' → 저장 (문구 12·13)
3. (15초) 기기 반응: [가운데 투입통에 넣기] → 프로젝터의 기기 뚜껑 열림, 원판 회전, 5번 칸으로 이송 (문구 1)
4. (25초) 가족 경고: 가족 탭 → 서윤 카드에 유산균 체크 → 저장 → 알레르기 모달(문구 4) → [빼고 저장]. 아빠 카드에 오메가3 체크 → 저장 → 약 모달(문구 5)
5. (15초) 상담용 목록: 모달의 [상담할 때 보여 줄 목록] → S11 아빠 목록(제품·성분 합계·먹는 약·경고 근거, 문구 14) → "판단은 약사·의사가 합니다" → 돌아가 [빼고 저장]
6. (15초) 엄마 안전: 안전 탭 → 아연 96% 주황, 비타민D·아연 중복 노랑 → 아연 카드 근거 펼치기 (문구 2·3)
7. (10초) 기기 버튼: 노트북에서 기기의 [아빠] 버튼 → 3번 칸 회전·배출 → 파우치 "아빠 · 11/21 1회차" → 휴대폰에 토스트
8. (10초) 건강·기록: 건강 탭(엄마) 영양 정보 카드(문구 6, 새 제품을 더하기 전에 확인) → 기록 하위 탭 요약(문구 7·8)
9. (5초) 마무리: "확인하고 정리하는 건 퓨믹스, 판단은 약사·의사가 합니다."

시간이 빠듯하면 6번과 8번을 줄인다(2~5번이 핵심). 시간이 남으면(Could) 여행 모드 3박 4일.

## 15. 발표 질의 대비 (데모·명세서로 답할 수 있는 것)

| 예상 질문 | 답의 뼈대 | 근거 |
| --- | --- | --- |
| AI를 빼면 무엇이 안 되나? | 공공데이터에 없는 해외 직구 라벨을 읽어 성분·알레르기·보관 정보로 정리한다. 경고 판단은 일부러 규칙으로 해서 틀린 경고를 줄였다 | 9절 AI 인식 카드, 11절 |
| AI가 라벨을 잘못 읽으면? | 확인 필요 표시 + 원문 대조, 사용자가 확인하기 전 값은 경고 계산에 쓰지 않는다 | 11절 규칙 0, T5 |
| 알디·알고케어와 뭐가 다른가? | 추천하지 않고 확인한다. 시중 제품·먹는 약·알레르기를 함께 보고, 결과를 상담용 목록으로 약사에게 넘긴다 | 기획서 4절 |
| 심평원 '내가 먹는 약! 한눈에', 건보공단 다제약물 관리사업과 겹치나? | 두 서비스는 조제받은 의약품과 처방 이력이 중심이다. 퓨믹스는 집에 있는 건강기능식품까지 포함하고, 가족 단위로 매일 배출한다. 상담용 목록(S11)은 약사 상담 자료로 이어질 수 있다 [ANALYSIS] | 기획서 4.1 |
| 왜 앱만이 아니라 기기인가? | 보관(서늘 구역)과 매일 배출까지 해야 "알고도 챙기지 못하는" 문제가 풀린다. 휴대폰 ↔ 기기 연결 데모가 그 구조를 보여 준다 | 3절, 기획서 2.1 |
| 실제 기기를 만들 수 있나? | 칸별 배출 기구가 가장 어렵다고 인정하고, 정제·캡슐로 한정해 단계적으로 시제품을 만든다 | 기획서 7.3 |
| 가족 정보를 엄마 폰에서 다 보는데 동의는? | 구성원별 본인 동의, 만 14세 미만은 법정대리인 동의. 데모 카드에 공유 동의를 표시한다 | 10절 구성원 표, 기획서 9절 |

## 16. 열린 결정

아래는 SW팀이 22:00 전에 정한다. 괄호 안이 작성자 제안이다.

- [ ] 스택: 빌드 없는 정적 웹 vs Vite + React (제안: 정적 웹)
- [ ] A·B·C 담당자 이름, relay 담당 (제안: A)
- [ ] LLM API: 누구 키로, 비용 한도 (제안: 라벨 1회 인식은 Must, 실시간은 로컬 Should)
- [ ] Supabase 프로젝트 만들 사람, anon 키를 `config.js`에 커밋할지 (제안: 커밋, 테이블 없음)
- [ ] 발표 노트북·휴대폰·미러링 방법 (scrcpy 또는 QuickTime), 클릭할 사람
- [ ] 배포 위치: Vercel vs GitHub Pages (제안: Vercel, 팀장이 푸시를 지시한 뒤)
- [ ] 3D→2D 전환 판단 시각 (제안: 01:00)
- [ ] Must 범위 확정 (2절 표)

기준 문서: `docs/서비스-기획서.md` v2.2 (기능 ID·화면 번호 원본, 이 명세서와 맞춤), `README.md` 2절(두 페이지 연결 원안), `demo/js/relay.js`(이벤트 목록·생존 확인 구현), 주의 조합 근거: [식약처 정보그림 뉴스](https://www.mfds.go.kr/brd/m_629/view.do?seq=31).
