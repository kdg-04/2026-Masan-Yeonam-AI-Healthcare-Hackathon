// 외출 파우치 알람: 외출 모드로 나온 파우치를 챙겨 갔을 때, 정한 시간이나 워치 기록 패턴(점심 식사가 끝난 때)에 알려 준다.
// 화면 조각만 여기: 알람 고르기 시트, 홈 '챙겨 간 파우치' 카드, 패턴 그래프. 동작은 app.js api(setOutingAlarm 등).
import { esc, tile } from './ui.js';
import { mealPattern, toMin } from '../engine/pattern.js';

export const SCENARIO_NOW = '09:41'; // 시연 화면 상태 표시줄 시각
const addMin = (hhmm, m) => { const t = toMin(hhmm) + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** '12:30' → '오후 12:30', '18:30' → '오후 6:30' */
export function koTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`;
}
export const patternOf = (s, memberId) => {
  const rec = s.health?.[memberId]?.intraday;
  return rec ? mealPattern(rec.days, rec) : null;
};

/** 패턴 그래프: 날짜별 '식사 끝' 추정 시각(점), 평소 범위(띠), 평소 시각(선). 추정 안 된 날은 아래에 빈 점 */
export function patternChart(p) {
  const W = 300, H = 104, L = 40, R = 8, T = 8, B = 22;
  const lo = toMin('12:00'), hi = toMin('13:40');
  const x = (i) => L + (i / Math.max(1, p.perDay.length - 1)) * (W - L - R);
  const y = (hhmm) => T + ((Math.min(hi, Math.max(lo, toMin(hhmm))) - lo) / (hi - lo)) * (H - T - B);
  const md = (iso) => iso.slice(5).replace('-', '/');
  const ticks = ['12:00', '12:30', '13:00', '13:30'];
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${p.days}일 점심 식사가 끝난 추정 시각. 평소 ${koTime(p.usual)}, 대부분 ${koTime(p.low)}~${koTime(p.high)}">
    ${ticks.map((t) => `<line class="chart__grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"></line><text class="chart__axis" x="${L - 6}" y="${y(t) + 3}" text-anchor="end">${t}</text>`).join('')}
    <rect class="chart__band" x="${L}" y="${y(p.low) - 3}" width="${W - L - R}" height="${y(p.high) - y(p.low) + 6}" rx="4"></rect>
    <line class="pchart__usual" x1="${L}" x2="${W - R}" y1="${y(p.usual)}" y2="${y(p.usual)}"></line>
    ${p.perDay.map((d, i) => (d.end ? `<circle class="chart__dot" cx="${x(i)}" cy="${y(d.end)}" r="3.5"><title>${md(d.date)} ${d.end}</title></circle>` : `<circle class="pchart__miss" cx="${x(i)}" cy="${H - B + 9}" r="3"><title>${md(d.date)} 추정 안 됨</title></circle>`)).join('')}
    <text class="chart__axis" x="${L}" y="${H - 1}">${md(p.perDay[0].date)}</text>
    <text class="chart__axis" x="${W - R}" y="${H - 1}" text-anchor="end">${md(p.perDay.at(-1).date)}</text>
  </svg>`;
}

const HOW = '걸음이 줄고 심박이 조금 오른 구간이 30분 넘게 이어지다 끝나면 식사가 끝난 것으로 봐요. 그날 추정이 안 되면 평소 시간 20분 뒤에 알려요.';

/** 알람 고르기 시트 (외출 파우치가 나오면 뜸) */
export function outingSheet(s) {
  const o = s.ui.outing;
  if (!s.ui.outingAsk || !o) return '';
  const tab = s.ui.outingTab ?? 'time';
  const time = s.ui.outingTime ?? '12:30';
  const chips = [['1시간 뒤', addMin(SCENARIO_NOW, 60)], ['점심', '12:30'], ['저녁', '18:30']];
  const p = patternOf(s, o.memberId);
  const timeTab = `
    <div class="time-chips">${chips.map(([name, t]) => `<button class="time-chip" data-otime="${t}" aria-pressed="${t === time}">${name}<small>${koTime(t)}</small></button>`).join('')}</div>
    <label class="time-input">직접 정하기 <input type="time" value="${time}" data-otime-input></label>
    <button class="btn btn--primary" data-oset="time">${koTime(time)}에 알림</button>`;
  const patternTab = p?.ok ? `
    <div class="pattern">
      <p class="pattern__eyebrow">워치 기록 ${p.days}일 분석 <span class="muted">(가상 · 건강 탭과 같은 워치)</span></p>
      <p class="pattern__big">평소 점심 식사가 끝나는 시간 <b>${koTime(p.usual)}</b></p>
      <p class="muted">대부분 ${koTime(p.low)}~${koTime(p.high)} · ${p.days}일 중 ${p.detected}일 추정</p>
      ${patternChart(p)}
      <p class="pattern__how">${HOW}</p>
      <p class="footnote">데모: 가상 워치 기록을 정해 둔 규칙으로 계산 · 실서비스: 개인별 학습 모델</p>
    </div>
    <p class="pconsent">${tile('#4A86F7', 'lock', 'tile--sm')}<span>워치의 걸음 수·심박 기록을 이 알람에만 써요. 건강 정보라 따로 동의를 받고, 설정에서 언제든 끌 수 있어요.</span></p>
    <button class="btn btn--primary" data-oset="pattern">동의하고 AI 맞춤 알람 켜기</button>`
    : `<p class="empty">워치 기록이 아직 부족해요(5일 이상 필요). 시간을 정해 주세요.</p>`;
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="outing-title"><div class="modal__sheet">
    <p class="muted">${esc(o.label)} · ${o.count}종</p>
    <h2 id="outing-title">챙겨 가는 파우치, 언제 알려 드릴까요?</h2>
    <div class="segmented" role="tablist">
      <button role="tab" data-otab="time" aria-selected="${tab === 'time'}">시간 정하기</button>
      <button role="tab" data-otab="pattern" aria-selected="${tab === 'pattern'}">AI 맞춤 알람</button>
    </div>
    ${tab === 'pattern' ? patternTab : timeTab}
    <button class="btn" data-oset="skip">알람 없이 닫기</button>
  </div></div>`;
}

/** 홈 '챙겨 간 파우치' 카드 */
export function outingCard(s) {
  const o = s.ui.outing;
  if (!o) return '';
  const r = s.ui.replay;
  const ringing = s.ui.alarm?.kind === 'pouch';
  let state, actions = '';
  if (o.taken) state = `먹었어요 · ${koTime(o.takenAt)} 기록`;
  else if (ringing) state = '알람이 울렸어요';
  else if (!o.alarm) { state = '알람 없음'; actions = '<button class="pill-btn pill-btn--light" data-oedit>알람 맞추기</button>'; }
  else if (o.alarm.kind === 'time') {
    state = `${koTime(o.alarm.time)}에 알려 드려요`;
    actions = '<button class="pill-btn pill-btn--light" data-oring>시연: 지금 울리기</button><button class="pill-btn pill-btn--ghost" data-oedit>바꾸기</button>';
  } else {
    state = `AI 맞춤 알람 · 점심 식사가 끝나면 (평소 ${koTime(o.alarm.usual)})`;
    actions = `<button class="pill-btn pill-btn--light" data-oreplay ${r ? 'disabled' : ''}>${r ? '재생 중' : '시연: 오늘 워치 기록 재생'}</button><button class="pill-btn pill-btn--ghost" data-oedit>바꾸기</button>`;
  }
  const replay = r ? `<div class="replay" role="status">
      <div class="replay__track"><span class="replay__fill" style="--v:${((r.bin + 1) / r.total) * 100}%"></span></div>
      <p>워치 ${koTime(r.at)} · 걸음 ${r.steps} · 심박 ${r.hr}${r.meal ? ' · <b>식사 중으로 보여요</b>' : ''}${r.ended ? ' · <b>걸음이 다시 늘었어요 → 식사가 끝난 것으로 보여요</b>' : ''}</p></div>` : '';
  return `<section class="outing glass" aria-label="챙겨 간 파우치">
    <div class="outing__head">${tile('#D27A22', 'box', 'tile--sm')}<div><p class="outing__eyebrow">챙겨 간 파우치</p><b>${esc(o.label)} · ${o.count}종</b></div></div>
    <p class="outing__state ${o.taken ? 'is-done' : ''}">${esc(state)}</p>
    ${replay}
    ${actions ? `<div class="outing__actions">${actions}</div>` : ''}
  </section>`;
}

/** 시트·카드 버튼 연결 (home 화면 bind와 app.js render에서 부름) */
export function bindOuting(root, api) {
  for (const b of root.querySelectorAll('[data-otab]')) b.addEventListener('click', () => api.set('ui.outingTab', b.dataset.otab));
  for (const b of root.querySelectorAll('[data-otime]')) b.addEventListener('click', () => api.set('ui.outingTime', b.dataset.otime));
  root.querySelector('[data-otime-input]')?.addEventListener('change', (e) => { if (e.target.value) api.set('ui.outingTime', e.target.value); });
  for (const b of root.querySelectorAll('[data-oset]')) b.addEventListener('click', () => api.setOutingAlarm(b.dataset.oset));
  for (const b of root.querySelectorAll('[data-oedit]')) b.addEventListener('click', () => api.set('ui.outingAsk', true));
  root.querySelector('[data-oring]')?.addEventListener('click', () => api.ringPouchAlarm('time'));
  root.querySelector('[data-oreplay]')?.addEventListener('click', () => api.replayWatch());
}
