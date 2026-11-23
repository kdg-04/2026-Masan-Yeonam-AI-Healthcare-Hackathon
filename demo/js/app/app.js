// 앱 페이지: 상태의 유일한 원천. 화면 전환, 기기와 이벤트 주고받기.
import { bus, store, loadData } from '../store.js';
import { startRelay } from '../relay.js';
import * as config from '../config.js';
import { pouchesFor, pouchLabel, todaySummary, nextAlarm } from '../engine/schedule.js';
import { assignSlot, slotMessage } from '../engine/slots.js';
import { createOnce, newId } from '../once.js';
const APP_ID = newId(); // 이 앱 창의 id: 기기는 한 앱의 상태만 따른다
import { toast, onToast, memberOf, mmdd, esc, chime } from './ui.js';
import { outingSheet, bindOuting, patternOf, koTime } from './outing.js';
import { firstMealEnd, toMin, toHHMM } from '../engine/pattern.js';
import * as home from './screens/home.js';
import * as supplements from './screens/supplements.js';
import * as safety from './screens/safety.js';
import * as family from './screens/family.js';
import * as health from './screens/health.js';
import * as menu from './screens/menu.js';

export const SCENARIO_DATE = '2026-11-21';
const SCREENS = { home, supplements, safety, family, health, menu };
const DEVICE_TIMEOUT_MS = 15000;
const LOAD_REMAINING = 30; // 새로 넣은 칸의 잔량(회분). 기기는 이만큼 알약을 붓는 장면을 보여 줌
const LOAD_TIMEOUT_MS = 25000; // 넣기 장면(통 붓기 → 호퍼 → 칸 돌리기 → 넣기)이 약 10초라 넉넉히

// 이 휴대폰의 주인(관리자) = 엄마. 처음엔 엄마 한 명, "+"로 초대하면 아빠 → 아들 → 딸 순서 (11-21 04:40 사용자 결정: 잠깐 아빠로 했다가 되돌림)
export const OWNER_ID = 'mom';
const initialUi = () => ({ tab: 'home', member: OWNER_ID, sub: null, highlightSlot: null, busy: null, editing: null, modal: null, pending: null, flags: {}, pouches: [] });

let pristine; // 시나리오 초기화용 원본
let relay;

function syncPayload(s) {
  return { slots: s.slots, products: s.products, members: s.members, scenarioDate: SCENARIO_DATE, today: todaySummary(s, SCENARIO_DATE), appId: APP_ID };
}
/** 기기에 지금 상태 보내기. claim = 사람이 이 앱에서 조작해서 바뀐 상태 → 기기가 이 앱을 따르게 (앱 창이 여럿일 때) */
function syncDevice(claim = false) { bus.emit('state:sync', { ...syncPayload(store.state), claim }); }

/** 제품 색: 회색 없이 색상환에서 서로 떨어진 화사한 색. 앞 9개는 데이터 제품, 뒤는 새로 등록할 때 쓴다 */
export const BRIGHT_COLORS = ['#FF9F43', '#FECA57', '#FF8FAB', '#1DD1A1', '#9B8CFF', '#54A0FF', '#FF6B6B', '#4CD07D', '#F368E0', '#A3E048', '#48DBFB', '#FDA7DF'];
function pickColor(wanted, products) {
  const used = new Set(products.map((p) => p.color?.toUpperCase()));
  if (wanted && !used.has(wanted.toUpperCase())) return wanted;
  return BRIGHT_COLORS.find((c) => !used.has(c.toUpperCase())) ?? wanted;
}

/* ───────── 동작 (화면에서 부름) ───────── */
export const api = {
  go(tab, sub = null) { if (tab === 'family') tab = 'safety'; /* 가족은 가족 안전 탭에 합침(11-21) */ const prev = { tab: store.state.ui.tab, sub: store.state.ui.sub }; store.update((s) => { if (prev.tab !== tab || prev.sub !== sub) s.ui.history = [...(s.ui.history ?? []), prev].slice(-20); s.ui.tab = tab; s.ui.sub = sub; s.ui.modal = null; s.ui.consultFrom = null; s.ui.consultLarge = false; }); document.querySelector('.app-main')?.scrollTo(0, 0); },
  /** 뒤로가기: 탭을 옮겨 온 순서대로 이전 화면으로 */
  back() {
    const h = store.state.ui.history ?? [];
    if (!h.length) return;
    const last = h[h.length - 1];
    store.update((s) => { s.ui.history = h.slice(0, -1); s.ui.tab = last.tab; s.ui.sub = last.sub; s.ui.modal = null; s.ui.consultFrom = null; });
    document.querySelector('.app-main')?.scrollTo(0, 0);
  },
  setMember(id) { store.set('ui.member', id); },
  set(path, value) { store.set(path, value); },
  update(fn) { store.update(fn); },

  /** S2 저장: 제품 추가 + 칸 배정 대기 */
  registerProduct(product, memberId) {
    const s = store.state;
    product = { ...product, color: pickColor(product.color, s.products.filter((p) => p.id !== product.id)) }; // 새 제품은 다른 제품과 겹치지 않는 화사한 색
    const a = assignSlot(product, s.slots);
    if (!a) { toast(s.copy.slotFull); return; }
    store.update((st) => {
      st.products = st.products.filter((p) => p.id !== product.id).concat(product);
      const list = st.presets[memberId] ?? (st.presets[memberId] = []);
      if (!list.some((it) => it.productId === product.id)) list.push({ productId: product.id, count: product.servingCount });
      st.ui.pending = { productId: product.id, memberId, slot: a.slot, message: slotMessage(product, a, st.copy), loaded: false };
      st.ui.sub = 'assign';
    });
    bus.emit('product:registered', { product });
  },

  /** S3: 가운데 투입통에 넣기 */
  async loadIntoDevice() {
    const p = store.state.ui.pending;
    if (!p || store.state.ui.busy) return;
    if (relay?.peerStatus() === 'none') { toast('기기 페이지가 연결되지 않았어요. 기기 페이지를 열어 주세요'); return; }
    store.set('ui.busy', 'load');
    const prod = store.state.products.find((x) => x.id === p.productId);
    // 방금 등록한 제품은 기기가 아직 모르므로(상태 동기화 전) 이름·색·제형·라벨 사진을 함께 보냄
    const product = prod && { id: prod.id, name: prod.name, form: prod.form, color: prod.color, labelImage: prod.labelImage ?? null };
    bus.emit('device:load', { productId: p.productId, slot: p.slot, remaining: LOAD_REMAINING, product, appId: APP_ID });
    armTimeout('load', () => { store.set('ui.busy', null); toast('기기 응답이 없어요. 칸에는 아직 넣지 않았어요'); }, LOAD_TIMEOUT_MS);
  },

  /** S7 조합 저장. remove = 빼고 저장할 제품 id, flag = 그대로 저장해서 주의 표시를 남길지 */
  savePreset(memberId, items, { remove = [], flag = false } = {}) {
    store.update((st) => {
      st.presets[memberId] = items.filter((it) => !remove.includes(it.productId));
      st.ui.flags[memberId] = flag;
      st.ui.editing = null;
      st.ui.modal = null;
    });
    toast(`${memberOf(store.state, memberId).title} 조합을 저장했어요`);
  },

  /** 앱의 배출 버튼: 먼저 '어디서 드세요?'(집에서·컵 / 외출·파우치)를 묻는 시트 */
  askDispense(memberId) {
    const p = planDispense(store.state, memberId);
    if (p.error) { toast(p.error); return; }
    store.set('ui.dispenseAsk', memberId);
  },
  /** 시트에서 고름: mode = 'cup' | 'pouch', null이면 취소 */
  answerDispense(mode) {
    const memberId = store.state.ui.dispenseAsk;
    store.set('ui.dispenseAsk', null);
    if (memberId && mode) api.dispense(memberId, newId(), mode);
  },

  /** 배출: 오늘 아직 안 나온 다음 회차. mode = 'cup' | 'pouch'(기기도 그 모드로 바꿔 배출), 없으면 기기에 설정된 모드 */
  dispense(memberId, id = newId(), mode = null) {
    const s = store.state;
    const p = planDispense(s, memberId);
    if (p.error) { toast(p.error); return; }
    const { next, items, label } = p;
    if (s.ui.alarm?.memberId === memberId) clearAlarm(); // 알람 받은 사람이 배출하면 알람 끔
    store.update((st) => { st.ui.busy = 'dispense'; st.ui.lastDispense = { id, memberId, round: next.round, items, label, mode }; });
    bus.emit('device:dispense', { id, memberId, round: next.round, items, label, mode, appId: APP_ID });
    issued.add(id);
    // 15초 안에 답이 없으면 잠금만 푼다. 잔량·기록은 바꾸지 않는다 (README 2-7)
    armTimeout('dispense', () => { store.set('ui.busy', null); toast('기기 응답이 없어요. 잔량은 그대로예요'); });
  },

  /** 복용 알람(데모): 지금 고른 구성원(없으면 오늘 첫 차례)에게. 휴대폰엔 알림 배너+소리, 기기엔 뚜껑 링·화면 깜빡임 */
  ringAlarm() {
    const a = nextAlarm(store.state, SCENARIO_DATE, store.state.ui.member);
    if (!a) { toast('오늘 복용을 모두 마쳐서 울릴 알람이 없어요'); return; }
    store.set('ui.alarm', a);
    bus.emit('device:alarm', { alarm: a, appId: APP_ID });
    chime();
    navigator.vibrate?.([200, 100, 200]);
  },
  /** 알람 배너 버튼: now = 바로 배출, 아니면 다시 알림(데모에서는 안내만) */
  answerAlarm(now) {
    const a = store.state.ui.alarm;
    if (!a) return;
    if (a.kind === 'pouch') { // 외출 파우치: now = 먹었어요
      store.update((st) => { st.ui.alarm = null; if (now && st.ui.outing) { st.ui.outing.taken = true; st.ui.outing.takenAt = a.time; } });
      toast(now ? '먹은 것으로 기록했어요' : '10분 뒤에 다시 알려 드릴게요');
      return;
    }
    clearAlarm();
    if (now) { api.go('home'); api.setMember(a.memberId); api.askDispense(a.memberId); }
    else toast('10분 뒤에 다시 알려 드릴게요');
  },

  /** 외출 파우치 알람 정하기: kind = 'time'(ui.outingTime) | 'pattern'(워치 기록 패턴, 동의 포함) | 'skip' */
  setOutingAlarm(kind) {
    const s = store.state, o = s.ui.outing;
    if (!o) return;
    let alarm = null, msg = '알람 없이 챙겨 가요';
    if (kind === 'time') { alarm = { kind: 'time', time: s.ui.outingTime ?? '12:30' }; msg = `${koTime(alarm.time)}에 알려 드릴게요`; }
    if (kind === 'pattern') {
      const p = patternOf(s, o.memberId);
      if (!p?.ok) { toast('워치 기록이 부족해 시간을 정해 주세요'); return; }
      alarm = { kind: 'pattern', usual: p.usual, consentAt: new Date().toISOString() };
      msg = `점심 식사가 끝나면 알려 드릴게요 (평소 ${koTime(p.usual)})`;
    }
    store.update((st) => { st.ui.outing.alarm = alarm; st.ui.outingAsk = false; });
    toast(msg);
  },
  /** 외출 파우치 알람 울리기 (시연: 시간이 됐거나 식사 끝이 추정됨). 기기는 집에 있으니 울리지 않음 */
  ringPouchAlarm(reason, extra = {}) {
    const o = store.state.ui.outing;
    if (!o || o.taken) return;
    const time = extra.time ?? (o.alarm?.kind === 'time' ? o.alarm.time : o.alarm?.usual);
    store.set('ui.alarm', { kind: 'pouch', reason, memberId: o.memberId, title: o.title, round: o.round, label: o.label, count: o.count, time, window: extra.window ?? null });
    chime();
    navigator.vibrate?.([200, 100, 200]);
  },
  /** 시연: 오늘 워치 기록(11:00~)을 10분 칸씩 빠르게 재생 → 식사가 끝난 것으로 보이는 칸에서 알람. 끝까지 없으면 평소 시간 20분 뒤 */
  replayWatch() {
    const s = store.state, o = s.ui.outing;
    const rec = o && s.health?.[o.memberId]?.intraday;
    if (!rec || s.ui.replay) return;
    const hit = firstMealEnd(rec.today, rec);
    const stopAt = hit ? hit.bin : rec.today.steps.length - 1;
    const base = toMin(rec.from);
    const quiet = (i) => rec.today.steps[i] < 150; // 화면 표시용: 걸음이 거의 없는 칸
    let bin = 0;
    clearInterval(replayTimer);
    replayTimer = setInterval(() => {
      store.set('ui.replay', { bin, total: stopAt + 1, at: toHHMM(base + bin * rec.binMin), steps: rec.today.steps[bin], hr: rec.today.hr[bin], meal: quiet(bin) && bin < stopAt, ended: Boolean(hit) && bin >= stopAt });
      if (bin >= stopAt) {
        clearInterval(replayTimer);
        replayTimer = setTimeout(() => {
          store.set('ui.replay', null);
          if (hit) api.ringPouchAlarm('pattern', { time: hit.window.end, window: hit.window });
          else api.ringPouchAlarm('fallback', { time: toHHMM(toMin(o.alarm?.usual ?? '12:30') + 20) });
        }, 1100); // '식사가 끝난 것으로 보여요'를 잠깐 보여 준 뒤 알람
      }
      bin++;
    }, 260);
  },

  refill(slot) {
    store.update((st) => { const sl = st.slots.find((x) => x.slot === slot); if (sl) sl.remaining = 60; });
    syncDevice(true);
    toast(`${slot}번 칸을 채웠어요`);
  },

  selectSlot(slot) { store.set('ui.highlightSlot', slot); bus.emit('ui:selectSlot', { slot, appId: APP_ID }); },

  /** 데모: 초대 코드를 보낸 뒤, 다른 폰에서 코드를 입력한 것처럼 잠시 뒤 수락 알림을 띄운다 */
  sendInvite() {
    let next = store.state.candidates?.[0];
    if (!next) { // 4인 가족 기준이 아니다: 준비된 후보가 없으면 새 가족(가상)을 만든다
      const extra = [{ id: 'grandma', title: '할머니', name: '김순자', age: 78 }, { id: 'grandpa', title: '할아버지', name: '이만수', age: 81 }];
      const have = new Set(store.state.members.map((m) => m.id));
      const n = store.state.members.length + 1;
      next = extra.find((x) => !have.has(x.id)) ?? { id: `fam${Date.now()}`, title: `가족 ${n}`, name: `가족${n}`, age: 40 };
      next = { allergies: [], ...next };
      store.update((st) => { st.candidates = [...(st.candidates ?? []), next]; });
    }
    toast('초대 코드를 보냈어요');
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(() => store.set('ui.joinRequest', { memberId: next.id }), 2500);
  },
  /** 구성원 빼기 (칩을 꾹 누름 → 확인 시트). 관리자(이 휴대폰 주인, 엄마)는 뺄 수 없음. 다시 초대하면 조합이 그대로 돌아옴 */
  askRemove(id) {
    if (id === OWNER_ID) { toast(`관리자(${memberOf(store.state, id)?.title ?? '주인'})는 가족에서 뺄 수 없어요`); return; }
    store.set('ui.removeAsk', id);
  },
  removeMember(id) {
    const m = store.state.members.find((x) => x.id === id);
    store.update((st) => {
      st.ui.removeAsk = null;
      if (!m) return;
      st.members = st.members.filter((x) => x.id !== id);
      st.candidates = [m, ...(st.candidates ?? []).filter((x) => x.id !== id)];
      if (st.ui.member === id) st.ui.member = OWNER_ID;
    });
    if (m) { toast(`${m.title}님을 가족에서 뺐어요`); syncDevice(true); }
  },
  answerJoin(accept) {
    const req = store.state.ui.joinRequest;
    if (!req) return;
    const m = store.state.candidates.find((x) => x.id === req.memberId);
    store.update((st) => {
      st.ui.joinRequest = null;
      if (accept && m) { st.members.push(m); st.candidates = st.candidates.filter((x) => x.id !== m.id); }
    });
    if (accept && m) { toast(`${m.title}님이 가족이 되었어요`); syncDevice(true); } else toast('초대를 거절했어요');
  },

  /** 시나리오 초기화: 앱 상태를 처음으로 + 기기도 처음 상태로(컵 모드·출구 비움·알람 끔), 기기는 이 앱을 따름.
   *  기기가 device:reset으로 같은 방의 다른 앱(휴대폰 등)에도 전해 모두 처음으로 돌아간다 */
  reset() {
    const resetId = newId();
    firstReset(resetId);
    resetState();
    bus.emit('scenario:reset', { appId: APP_ID, resetId });
    syncDevice(true);
    toast('시나리오를 처음으로 되돌렸어요');
  },
};

/** 배출할 다음 회차 정하기. 못 하면 { error: 안내 문구 } */
function planDispense(s, memberId) {
  if (s.ui.busy) return { error: '기기가 동작 중이에요. 끝나면 다시 눌러 주세요' };
  const member = memberOf(s, memberId);
  if (!member) return { error: '가족에 없는 사람이에요' };
  const pouches = pouchesFor(s.presets[memberId] ?? [], s);
  if (!pouches.length) return { error: `${member.title} 조합이 비어 있어요` };
  const done = s.logs.filter((l) => l.date === SCENARIO_DATE && l.memberId === memberId).map((l) => l.round);
  const next = pouches.find((p) => !done.includes(p.round)) ?? pouches[0];
  const items = next.items.filter((it) => it.slot != null).map(({ slot, count }) => ({ slot, count }));
  if (!items.length) return { error: '칸에 들어 있는 제품이 없어요' };
  if (relay?.peerStatus() === 'none') return { error: '기기 페이지가 연결되지 않았어요. 기기 페이지를 열어 주세요' };
  return { member, next, items, label: pouchLabel(member.title, next.round, SCENARIO_DATE) };
}

function clearAlarm() {
  store.set('ui.alarm', null);
  bus.emit('device:alarm', { alarm: null, appId: APP_ID });
}

/** 앱 상태만 처음으로 (기기에 알리지 않음) */
function resetState() {
  clearInterval(replayTimer); clearTimeout(replayTimer);
  for (const id of issued) ignoredDispense.add(id); // 초기화 전에 보낸 배출이 늦게 끝나도 기록에 넣지 않음
  issued.clear();
  clearTimeout(timeoutTimer);
  clearTimeout(inviteTimer);
  store.reset({ ...structuredClone(pristine), ui: initialUi() });
}
const firstReset = createOnce(); // 기기가 여러 대면 같은 초기화 신호가 여러 번 옴

/* ───────── 기기에서 온 이벤트 ───────── */
let timeoutTimer = null;
let replayTimer = null; // 워치 기록 재생
function armTimeout(kind, fn, ms = DEVICE_TIMEOUT_MS) {
  clearTimeout(timeoutTimer);
  timeoutTimer = setTimeout(() => { if (store.state.ui.busy === kind) fn(); }, ms);
}

function applyLoaded({ productId, slot }) {
  clearTimeout(timeoutTimer);
  store.update((st) => {
    const sl = st.slots.find((x) => x.slot === slot);
    if (sl) { sl.productId = productId; sl.remaining = LOAD_REMAINING; }
    if (st.ui.pending?.productId === productId) st.ui.pending.loaded = true;
    st.ui.busy = null;
  });
  syncDevice();
}

// 같은 배출 완료(id)는 한 번만 반영: 기기 창이 여러 개여도 잔량이 두 번 줄지 않게
const firstDispensed = createOnce();
const issued = new Set();          // 이 앱이 보낸 배출 id (초기화 때 비움)
const ignoredDispense = new Set(); // 초기화 전에 보낸 배출: 끝났다는 신호가 와도 무시
function applyDispensed({ id, memberId, round, at, mode }, items, label) {
  if (!firstDispensed(id) || ignoredDispense.has(id)) return;
  issued.delete(id);
  clearTimeout(timeoutTimer);
  const last = store.state.ui.lastDispense;
  items ??= last?.items ?? [];
  label ??= last?.label ?? '';
  store.update((st) => {
    for (const it of items) { const sl = st.slots.find((x) => x.slot === it.slot); if (sl) sl.remaining = Math.max(0, sl.remaining - it.count); }
    st.logs = st.logs.filter((l) => !(l.date === SCENARIO_DATE && l.memberId === memberId && l.round === round));
    st.logs.push({ date: SCENARIO_DATE, memberId, round, taken: true });
    st.ui.pouches = [{ memberId, round, label, items, at }, ...st.ui.pouches].slice(0, 6);
    st.ui.busy = null;
  });
  const shown = last?.id === id && last.mode ? last.mode : mode; // 앱에서 고른 방식이 있으면 그것으로 안내
  // 이 앱이 보낸 배출이 외출 파우치로 나왔으면: 챙겨 가는 파우치 알람 고르기 (시간 / 워치 패턴)
  if (shown === 'pouch' && last?.id === id) {
    const m = memberOf(store.state, memberId);
    store.update((st) => {
      st.ui.outing = { memberId, title: m?.title ?? '', round, label, count: items.length, alarm: null, taken: false };
      st.ui.outingAsk = true; st.ui.outingTab = 'time'; st.ui.outingTime = '12:30';
      if (st.ui.alarm?.kind === 'pouch') st.ui.alarm = null;
    });
  }
  toast(shown === 'cup' ? `${label} 컵에 담겼어요` : `${label} 파우치가 나왔어요`);
  syncDevice();
}

function wireDeviceEvents() {
  bus.on('device:hello', () => syncDevice());
  // 다른 앱(같은 방의 휴대폰·노트북)에서 [시나리오 초기화]를 누름 → 이 앱도 처음으로
  bus.on('device:reset', ({ appId, resetId }) => {
    if (appId === APP_ID || !firstReset(resetId)) return;
    resetState();
    toast('다른 화면에서 시나리오를 처음으로 되돌렸어요');
  });
  bus.on('device:loaded', (p) => applyLoaded(p));
  bus.on('device:dispensed', (p) => applyDispensed(p));
  bus.on('device:button', ({ memberId, id }) => { api.go('family'); api.setMember(memberId); api.dispense(memberId, id); });
  bus.on('device:slotSelected', ({ slot }) => { store.update((s) => { s.ui.tab = 'supplements'; s.ui.sub = null; s.ui.highlightSlot = slot; }); });
}

/* ───────── 화면 그리기 ───────── */
function render() {
  const s = store.state;
  const root = document.getElementById('screen');
  const screen = SCREENS[s.ui.tab] ?? SCREENS.home;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-current', b.dataset.tab === (s.ui.tab === 'family' ? 'safety' : s.ui.tab) ? 'page' : 'false'); // 가족은 설정 안의 화면
  try {
    root.innerHTML = screen.render(s, api) + joinAlert(s) + removeAlert(s) + dispenseSheet(s) + outingSheet(s);
    if (!s.ui.sub && s.ui.history?.length) root.insertAdjacentHTML('afterbegin', '<button class="back-nav" data-back>‹ 뒤로</button>'); // 하위 화면은 자체 뒤로·닫기가 있음
    root.querySelector('[data-back]')?.addEventListener('click', () => api.back());
    if (root.querySelector('.modal')) { const tt = document.getElementById('toast'); if (tt) tt.hidden = true; } // 시트가 뜨면 알림은 숨김(겹치지 않게)
    screen.bind?.(root, api, s);
  } catch (e) {
    // 화면 하나에서 오류가 나도 탭이 조용히 멈추지 않게: 탭은 바뀌고, 무슨 오류인지 화면에 보인다
    console.error(`[render] ${s.ui.tab}`, e);
    root.innerHTML = `<p class="load-error">이 화면을 그리다 문제가 생겼어요 (${esc(s.ui.tab)}). 이 문구를 캡처해 알려 주세요.<br><code>${esc(e?.message ?? e)}</code></p>`;
    return;
  }
  for (const c of root.querySelectorAll('[data-member]')) {
    let timer = null, long = false; // 꾹 누르면(0.6초) 빼기 확인
    c.addEventListener('pointerdown', () => { long = false; timer = setTimeout(() => { long = true; api.askRemove(c.dataset.member); }, 600); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) c.addEventListener(ev, () => clearTimeout(timer));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('click', () => { if (!long) api.setMember(c.dataset.member); });
  }
  for (const b of root.querySelectorAll('[data-remove]')) b.addEventListener('click', () => (b.dataset.remove === 'yes' ? api.removeMember(store.state.ui.removeAsk) : api.set('ui.removeAsk', null)));
  for (const b of root.querySelectorAll('[data-mode]')) b.addEventListener('click', () => api.answerDispense(b.dataset.mode === 'cancel' ? null : b.dataset.mode));
  bindOuting(root, api); // 외출 파우치 알람 시트·홈 카드
  for (const c of root.querySelectorAll('[data-add-member]')) c.addEventListener('click', () => api.sendInvite()); // 구성원 줄의 + → 가족 초대
  for (const b of root.querySelectorAll('[data-join]')) b.addEventListener('click', () => api.answerJoin(b.dataset.join === 'yes'));
}

// 복용 알람 배너: 화면(탭)과 따로, 폰 화면 위쪽에 iOS 알림처럼 뜬다
function renderAlarm(s) {
  const el = document.getElementById('alarm');
  if (!el) return;
  const a = s.ui.alarm;
  const key = a ? `${a.kind ?? 'dose'}-${a.reason ?? ''}-${a.memberId}-${a.round}` : '';
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.hidden = !a;
  if (!a) { el.innerHTML = ''; return; }
  const tt = document.getElementById('toast'); if (tt) tt.hidden = true; // 같은 자리라 알림(토스트)은 숨김
  if (a.kind === 'pouch') { el.innerHTML = pouchAlarmHtml(a); bindAlarm(el); return; }
  el.innerHTML = `
    <div class="alarm__head"><span class="alarm__app" aria-hidden="true">P</span><span>PUMIX · 복용 알람</span><span class="alarm__now">지금</span></div>
    <p class="alarm__title">${esc(a.title)}님, ${esc(a.roundName)} 영양제 드실 시간이에요</p>
    <p class="alarm__body">${esc(a.time)} · ${a.count}종 · 기기의 [${esc(a.title)}] 버튼을 눌러도 나와요</p>
    <div class="alarm__actions"><button class="alarm__btn" data-alarm="later">10분 뒤 다시</button><button class="alarm__btn alarm__btn--go" data-alarm="now">지금 배출</button></div>`;
  bindAlarm(el);
}
const bindAlarm = (el) => { for (const b of el.querySelectorAll('[data-alarm]')) b.addEventListener('click', () => api.answerAlarm(b.dataset.alarm === 'now')); };
/** 외출 파우치 알람 배너: 정한 시간 / 워치 패턴(식사 끝 추정) / 추정 안 됨(평소 시간 뒤) */
function pouchAlarmHtml(a) {
  const title = a.reason === 'pattern' ? `${esc(a.title)}님, 점심 식사가 끝난 것 같아요` : `${esc(a.title)}님, 챙겨 가신 파우치 드실 시간이에요`;
  const body = a.reason === 'pattern'
    ? `워치: ${koTime(a.window.start)}~${koTime(a.window.end)} 걸음이 줄고 심박이 올랐어요 · 챙겨 가신 파우치(${a.count}종)를 드세요`
    : a.reason === 'fallback' ? `오늘은 식사 시간이 잡히지 않아 평소 시간 뒤(${koTime(a.time)})에 알려 드려요 · ${a.count}종`
    : `${koTime(a.time)} 알람 · ${esc(a.label)} · ${a.count}종`;
  return `
    <div class="alarm__head"><span class="alarm__app" aria-hidden="true">P</span><span>PUMIX · 외출 파우치</span><span class="alarm__now">지금</span></div>
    <p class="alarm__title">${title}</p>
    <p class="alarm__body">${body}</p>
    <div class="alarm__actions"><button class="alarm__btn" data-alarm="later">10분 뒤 다시</button><button class="alarm__btn alarm__btn--go" data-alarm="now">먹었어요</button></div>`;
}

// 배출 방법 고르기 시트: 집에서(컵에 담아 바로) / 외출(파우치로 밀봉)
const MODE_SVG = {
  cup: '<path d="M6 4h12l-1.6 15.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z"/><path d="M6.6 9h10.8"/>',
  pouch: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 7.5h14"/><path d="M9 3v4.5M12 3v4.5M15 3v4.5"/>',
};
function dispenseSheet(s) {
  const id = s.ui.dispenseAsk;
  if (!id) return '';
  const p = planDispense({ ...s, ui: { ...s.ui, busy: null } }, id);
  if (p.error) return '';
  const opt = (mode, title, sub) => `<button class="mode-opt mode-opt--${mode}" data-mode="${mode}">
      <span class="mode-opt__ic"><svg viewBox="0 0 24 24" aria-hidden="true">${MODE_SVG[mode]}</svg></span><b>${title}</b><small>${sub}</small></button>`;
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mode-title"><div class="modal__sheet">
    <p class="muted">${esc(p.member.title)} ${p.next.round}회차 · ${p.items.length}종</p>
    <h2 id="mode-title">어디서 드세요?</h2>
    <div class="mode-pick">
      ${opt('cup', '집에서', '컵에 담아 바로 드세요')}
      ${opt('pouch', '외출', '파우치에 밀봉해 드려요')}
    </div>
    <button class="btn" data-mode="cancel">취소</button>
  </div></div>`;
}

// 초대 수락 알림 (어느 탭에 있어도 뜸)
let inviteTimer = null;
function removeAlert(s) {
  const m = s.ui.removeAsk && s.members.find((x) => x.id === s.ui.removeAsk);
  if (!m) return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="remove-title"><div class="modal__sheet">
    <h2 id="remove-title">${esc(m.title)}님을 가족에서 뺄까요?</h2>
    <p class="muted">기기 버튼과 가족 안전에서 사라져요. 다시 초대하면 조합이 그대로 돌아와요.</p>
    <div class="member__actions"><button class="btn" data-remove="no">취소</button><button class="btn btn--primary" data-remove="yes">빼기</button></div>
  </div></div>`;
}

function joinAlert(s) {
  const req = s.ui.joinRequest;
  const m = req && s.candidates?.find((x) => x.id === req.memberId);
  if (!m) return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="join-title">
    <div class="modal__sheet">
      <p class="muted">가족 초대</p>
      <h2 id="join-title">${m.title}님이 초대 코드를 입력했습니다. 초대를 수락하시겠습니까?</h2>
      <p class="muted">${m.name}(가상) · ${m.age}세 · 휴대폰에서 코드 ${INVITE_CODE} 입력</p>
      <div class="member__actions">
        <button class="btn" data-join="no">거절</button>
        <button class="btn btn--primary" data-join="yes">수락</button>
      </div>
    </div>
  </div>`;
}
export const INVITE_CODE = 'PUMX-4821';

// 시연 화면은 분할 화면(index.html: 왼쪽 기기 + 오른쪽 앱). 앱은 ?view=mirror 로 열려 폭과 관계없이 아이폰 틀을 쓴다
const MIRROR_VIEW = new URLSearchParams(location.search).get('view') === 'mirror';
function fitPhone() {
  const frame = document.querySelector('.phone');
  if (!frame) return;
  const framed = MIRROR_VIEW || window.matchMedia('(min-width: 40rem)').matches; // 분할 화면이거나 넓은 화면이면 아이폰 틀 (css/mirror.css)
  document.documentElement.classList.toggle('is-framed', framed);
  if (!framed) { frame.style.setProperty('--phone-scale', '1'); return; }
  const used = ['.topbar', '.virtual-note', '.mirror-cap']
    .reduce((sum, sel) => sum + (document.querySelector(sel)?.offsetHeight ?? 0), 0);
  const availH = window.innerHeight - used - 56; // 상단 바 여백·무대 안쪽 여백·미러링 표시 아래 간격
  const availW = window.innerWidth - 24;
  const scale = Math.min(1, availH / frame.offsetHeight, availW / frame.offsetWidth);
  frame.style.setProperty('--phone-scale', Math.max(0.35, scale).toFixed(3));
}

/* ───────── 미러링: 실제 휴대폰(조종) → 시연 화면 오른쪽 아이폰 틀(따라 그리기) ─────────
 * 휴대폰 앱은 상태가 바뀔 때마다 화면 상태(고정 데이터 빼고)와 스크롤을 보낸다.
 * 시연 화면 오른쪽 앱(?follow=1)은 그 상태로 똑같이 그리기만 하고, 기기에는 아무것도 보내지 않는다. */
const PARAMS = new URLSearchParams(location.search);
const FOLLOW = PARAMS.get('follow') === '1';
const STATIC_KEYS = ['limits', 'interactions', 'copy', 'health', 'guideRules', 'ocr'];
let mirrorLeader = false;
let mirrorTimer = null;
function sendMirror() {
  if (!mirrorLeader) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    const s = store.state;
    const state = Object.fromEntries(Object.entries(s).filter(([k]) => !STATIC_KEYS.includes(k)));
    bus.emit('mirror:state', { state, scroll: document.querySelector('.app-main')?.scrollTop ?? 0 });
  }, 60);
}

async function startFollower() {
  document.documentElement.classList.add('is-follow'); // 보여 주기만: 누를 수 없게 (css/mirror.css)
  relay = await startRelay({ bus, role: 'mirror', config });
  const roomEl = document.getElementById('room');
  if (roomEl) roomEl.textContent = relay.room;
  bus.on('mirror:state', ({ state, scroll }) => {
    const fixed = Object.fromEntries(STATIC_KEYS.map((k) => [k, pristine[k]]));
    store.reset({ ...fixed, ...state });
    requestAnimationFrame(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = scroll; });
  });
  bus.on('mirror:toast', ({ text }) => toast(text));
  const dot = document.getElementById('conn');
  relay.onStatus((st) => {
    if (!dot) return;
    dot.dataset.status = st === 'none' ? 'none' : 'remote';
    dot.querySelector('span').textContent = st === 'none' ? '휴대폰 연결을 기다리는 중' : '휴대폰 화면 미러링 중';
  });
  window.__yy = { store, bus, api };
}

async function main() {
  window.addEventListener('resize', fitPhone);
  fitPhone(); // 데이터를 못 불러와도 틀 크기는 먼저 맞춘다
  const data = await loadData('./data/');
  const [first] = data.members;
  const owner = data.members.find((m) => m.id === OWNER_ID) ?? first;
  pristine = { ...data, members: [owner], candidates: data.members.filter((m) => m !== owner) }; // 처음엔 엄마 한 명, 나머지(아빠·아들·딸)는 초대 후보
  store.reset({ ...structuredClone(pristine), ui: initialUi() });
  store.subscribe(render);
  store.subscribe(renderAlarm);
  render();

  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => api.go(b.dataset.tab));
  document.getElementById('reset')?.addEventListener('click', () => api.reset());
  document.getElementById('ring-alarm')?.addEventListener('click', () => api.ringAlarm());
  fitPhone();

  if (FOLLOW) return startFollower();

  wireDeviceEvents();
  relay = await startRelay({ bus, role: 'app', config });
  // 실제 휴대폰으로 연 앱(방 코드 있음, 인터넷 연결)이면 화면을 시연 화면으로 미러링한다
  mirrorLeader = relay.mode === 'remote' && !MIRROR_VIEW && Boolean(PARAMS.get('room'));
  if (mirrorLeader) {
    store.subscribe(sendMirror);
    onToast((text) => bus.emit('mirror:toast', { text }));
    document.querySelector('.app-main')?.addEventListener('scroll', sendMirror, { passive: true });
    bus.on('device:hello', sendMirror); // 기기가 5초마다 hello → 늦게 연 미러도 곧 따라옴
    sendMirror();
  }
  const room = document.getElementById('room');
  if (room) room.textContent = relay.room;
  const dot = document.getElementById('conn');
  relay.onStatus((st) => {
    if (!dot) return;
    dot.dataset.status = st;
    dot.title = { remote: '다른 기기의 기기 페이지와 연결됨', local: '같은 브라우저의 기기 페이지와 연결됨', none: '기기 페이지가 열려 있지 않아요' }[st];
    dot.querySelector('span').textContent = { remote: '기기 연결됨', local: '기기 연결됨(같은 브라우저)', none: '기기 없음' }[st];
  });
  syncDevice();
  window.__yy = { store, bus, api }; // 콘솔 디버깅용
}

main().catch((e) => {
  console.error(e);
  document.getElementById('screen').innerHTML = `<p class="load-error">데이터를 불러오지 못했어요. <code>npx serve .</code>로 열었는지 확인하세요.<br>${String(e.message)}</p>`;
});

export { mmdd };
