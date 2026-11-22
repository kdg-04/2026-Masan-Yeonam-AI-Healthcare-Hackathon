// 화면 공용 도우미

/* 선 아이콘 (lucide 형태, stroke=currentColor) */
const P = {
  pill: '<path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z"/><path d="m8.5 8.5 7 7"/>',
  tablet: '<circle cx="12" cy="12" r="8"/><path d="M7 12h10"/>',
  drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  box: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
export const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;

/** 색 타일 아이콘: tone = red | orange | green | blue | violet | product hex */
export function tile(tone, name = 'pill', size = '') {
  const style = tone?.startsWith('#') ? ` style="--tile:${tone}"` : '';
  return `<span class="tile tile--${tone?.startsWith('#') ? 'custom' : tone} ${size}"${style}>${icon(name)}</span>`;
}

/** 진행률 링 */
export function ring(done, total, label = '회') {
  const r = 30, c = 2 * Math.PI * r, frac = total ? done / total : 0;
  return `<div class="ring" role="img" aria-label="${total}${label} 중 ${done}${label}">
    <svg viewBox="0 0 72 72"><circle class="ring__track" cx="36" cy="36" r="${r}"/>${done ? `<circle class="ring__bar" cx="36" cy="36" r="${r}" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}"/>` : ''}</svg>
    <span class="ring__text"><b>${done}/${total}</b><small>${label}</small></span></div>`;
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const memberOf = (state, id) => state.members.find((m) => m.id === id);
export const productOf = (state, id) => state.products.find((p) => p.id === id);
export const slotOfProduct = (state, id) => state.slots.find((s) => s.productId === id);

/** 구성원 색: 엄마 핑크, 아빠 파랑, 아들 초록, 딸 보라 */
export const MEMBER_COLORS = { mom: '#FF6F9C', dad: '#4A86F7', son: '#2FBF71', daughter: '#9B7BFF' };
const EXTRA_COLORS = ['#FF9F43', '#1DD1A1', '#F368E0', '#48DBFB'];
export function memberChips(state, active) {
  return `<div class="chips" role="tablist" aria-label="구성원">
    <button class="chip chip--add" data-add-member aria-label="가족 초대하기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v10M7 12h10"/></svg></button>
    ${state.members.map((m, i) => `<button class="chip" role="tab" data-member="${m.id}" aria-selected="${m.id === active}" style="--mc:${MEMBER_COLORS[m.id] ?? EXTRA_COLORS[i % EXTRA_COLORS.length]}" title="꾹 누르면 가족에서 뺄 수 있어요">${esc(m.title)}</button>`).join('')}
  </div>`;
}

// 명세서 11절: 화면 등급 이름은 '꼭 확인 / 주의 / 참고'. '위험'이라는 말은 쓰지 않는다
export const LEVEL_LABEL = { danger: '꼭 확인', caution: '주의', info: '참고' };
export function warningCard(w, i) {
  const ev = w.evidence ?? {};
  const rows = [
    ev.source && ['출처', ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.source)}</a>` : esc(ev.source)],
    ev.value != null && ['하루 합계', esc(ev.value)],
    ev.limit != null && ['기준(상한)', `${esc(ev.limit)}${ev.verified === false ? ' · 원문 확인 전' : ''}`],
    ev.labelText && ['표시사항 원문', esc(ev.labelText)],
  ].filter(Boolean);
  const tone = { danger: 'red', caution: 'orange', info: 'blue' }[w.level];
  const ic = { allergy: 'ban', drug: 'pill', upper: 'alert', duplicate: 'drop', age: 'alert' }[w.type] ?? 'alert';
  return `<article class="warn warn--${w.level} glass">
    <div class="warn__head">${tile(tone, ic, 'tile--sm')}<div><p class="warn__level">${LEVEL_LABEL[w.level]}</p><h3 class="warn__title">${esc(w.title)}</h3></div></div>
    <p class="warn__msg">${esc(w.message)}</p>
    <details class="warn__ev"><summary>근거 보기</summary>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </details>
  </article>`;
}

let toastTimer;
let toastHook = null;
/** 알림이 뜰 때마다 부를 함수 (휴대폰 앱 → 시연 화면 미러링으로 같은 알림 보내기) */
export function onToast(fn) { toastHook = fn; }
export function toast(text) {
  toastHook?.(text);
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 알람 소리 '띵동 띵동' (파일 없이 Web Audio로). 소리를 못 내는 환경이면 조용히 넘어감 */
let audioCtx;
export function chime() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
    const t0 = audioCtx.currentTime + 0.02;
    [[988, 0], [784, 0.24], [988, 0.62], [784, 0.86]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.45);
    });
  } catch { /* 화면 알림은 그대로 뜬다 */ }
}
export const mmdd = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}`; };
