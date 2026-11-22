// 설정(≡) 탭: 가족 화면으로 들어가는 곳 + 기기·공유·알림·앱 정보
// 데모에서 실제로 동작하는 것은 '알림'(누르면 복용 알람을 울려 봄)뿐이고, 나머지는 정보만 보여 준다(없는 기능을 있는 것처럼 보이지 않게)
import { esc } from '../ui.js';

const SVG = {
  family: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  device: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 17h6"/>',
  share: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};
const row = ({ go, ring, ic, color, title, sub }) => {
  const inner = `<span class="menu-row__ic" style="--c:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${SVG[ic]}</svg></span>
    <span class="menu-row__main"><b>${esc(title)}</b><small>${esc(sub)}</small></span>`;
  if (ring) return `<button class="menu-row" data-ring-alarm>${inner}<span class="menu-row__chev" aria-hidden="true">›</span></button>`;
  return go
    ? `<button class="menu-row" data-go="${go}">${inner}<span class="menu-row__chev" aria-hidden="true">›</span></button>`
    : `<div class="menu-row">${inner}</div>`;
};

export function render(s) {
  return `
  <header class="screen-head"><h1>설정</h1></header>
  <div class="menu-list">
    ${row({ ic: 'device', color: '#4A86F7', title: '기기', sub: 'AI 영양 디스펜서 PUMIX · 12칸 · 칸 안 습도 관리' })}
    ${row({ ic: 'share', color: '#2FBF71', title: '정보 공유', sub: s.copy.shareConsent ?? '본인 동의(가상)' })}
    ${row({ ring: true, ic: 'bell', color: '#FF9F43', title: '복용 알람', sub: '아침 8:00 · 저녁 8:00 · 눌러서 울려 보기' })}
    ${row({ ic: 'info', color: '#9B7BFF', title: '앱 정보', sub: 'PUMIX · 모든 인물·제품·수치는 가상입니다' })}
  </div>`;
}

export function bind(root, api) {
  for (const b of root.querySelectorAll('[data-go]')) b.addEventListener('click', () => api.go(b.dataset.go));
  root.querySelector('[data-ring-alarm]')?.addEventListener('click', () => api.ringAlarm());
}
