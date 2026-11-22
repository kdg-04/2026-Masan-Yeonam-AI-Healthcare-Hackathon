// 제품 상세 (레퍼런스 2·3): 그라데이션 카드 + 캡슐 그림 · 잔량/지난 7일 카드 · 일정 토글 · 하단 동작
import { esc, memberOf, productOf, icon } from '../ui.js';
import { remainingDays, usersOf } from '../../engine/slots.js';

const ROUND_TIME = { 1: '오전 8:00', 2: '오후 8:00' };

function capsules(color) {
  const light = `color-mix(in oklab, ${color} 45%, white)`;
  const one = (x, y, r, s) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
    <rect x="-34" y="-13" width="68" height="26" rx="13" fill="url(#cap-b)"/>
    <rect x="-34" y="-13" width="34" height="26" rx="13" fill="url(#cap-w)"/>
    <rect x="-28" y="-9" width="50" height="5" rx="2.5" fill="white" opacity=".55"/></g>`;
  return `<svg class="detail-hero__art" viewBox="0 0 160 150" aria-hidden="true">
    <defs>
      <linearGradient id="cap-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${color}"/></linearGradient>
      <linearGradient id="cap-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6f7"/></linearGradient>
    </defs>
    ${one(92, 62, -38, 1.25)}${one(52, 112, 24, 0.8)}${one(132, 122, 70, 0.65)}${one(36, 36, 58, 0.55)}
    <circle cx="118" cy="30" r="4" fill="white" opacity=".7"/><circle cx="20" cy="84" r="3" fill="white" opacity=".6"/><circle cx="148" cy="80" r="2.5" fill="white" opacity=".6"/>
  </svg>`;
}

export function renderDetail(s) {
  const slot = s.slots.find((x) => x.slot === s.ui.detailSlot);
  const p = slot && productOf(s, slot.productId);
  if (!p) return '';
  const users = usersOf(p.id, s);
  const days = remainingDays(p.id, s);
  const week = s.logs.filter((l) => users.includes(l.memberId) && l.date >= '2026-11-14' && l.date <= '2026-11-20' && l.round <= p.timesPerDay);
  const taken = week.filter((l) => l.taken).length;
  const low = slot.remaining <= 10;
  const name = p.name.replace(/\(가상[^)]*\)/, '').trim();
  const main = p.nutrients[0];

  return `
  <header class="nav-head">
    <button class="circle-btn" data-sub="" aria-label="내 영양제로">${icon('back')}</button>
    <h1>제품 정보</h1>
    <button class="circle-btn" data-locate="${slot.slot}" aria-label="기기에서 ${slot.slot}번 칸 보기">${icon('box')}</button>
  </header>

  <section class="detail-hero">
    <p class="hero-chip">${icon('clock')}${slot.slot}번 칸 · 습도 ${slot.humidity}%</p>
    <h2 class="detail-hero__name">${esc(name)}</h2>
    <p class="detail-hero__sub">${main ? `${esc(main.label)} ${main.amount}${esc(main.unit)}` : ''} · ${esc(p.form)}</p>
    <div class="detail-hero__chips">
      <span class="hero-chip">${icon('drop')}하루 ${p.timesPerDay}회</span>
      <span class="hero-chip">${users.map((id) => esc(memberOf(s, id).title)).join(', ') || '쓰는 사람 없음'}</span>
    </div>
    ${capsules(p.color)}
  </section>

  <div class="mini-cards">
    <div class="mini glass">
      <p class="mini__label">${icon('lock')}잔량</p>
      <p class="mini__value"><b class="${low ? 'is-low' : ''}">${slot.remaining}</b>개</p>
      <span class="mini__bar ${low ? 'mini__bar--low' : ''}" style="--v:${Math.min(100, Math.round((slot.remaining / 60) * 100))}%"><span></span></span>
      <p class="mini__sub">${days !== null ? `${days}일 뒤 떨어져요` : '쓰는 사람이 없어요'}</p>
    </div>
    <div class="mini glass">
      <p class="mini__label">${icon('check')}지난 7일</p>
      <p class="mini__value"><b>${taken}</b>/ ${week.length}회</p>
      <span class="mini__bar mini__bar--ok" style="--v:${week.length ? Math.round((taken / week.length) * 100) : 0}%"><span></span></span>
      <p class="mini__sub">받은 파우치</p>
    </div>
  </div>

  <section class="sched">
    <div class="sec-head"><h2>일정</h2><button class="link" data-go="family">변경</button></div>
    <ul class="sched__list glass">
      ${users.flatMap((id) => Array.from({ length: p.timesPerDay }, (_, i) => `<li class="row">
        <span class="row-ic">${icon(i === 1 ? 'moon' : 'sun')}</span>
        <span class="row__main"><b>${ROUND_TIME[i + 1]}</b><small>${esc(memberOf(s, id).title)} ${i + 1}회차 · ${p.servingCount}${esc(p.form)}</small></span>
        <span class="switch is-on" role="img" aria-label="켜짐"><i></i></span>
      </li>`)).join('') || '<li class="row"><span class="row__main"><small>가족 탭에서 이 제품을 조합에 넣으면 일정이 생겨요</small></span></li>'}
    </ul>
  </section>

  <div class="action-bar glass">
    <button class="pill-btn pill-btn--ghost" data-refill="${slot.slot}">${icon('refresh')}보충</button>
    <button class="pill-btn pill-btn--navy" data-locate="${slot.slot}">${icon('box')}기기에서 보기</button>
  </div>`;
}

export function bindDetail(root, api) {
  for (const b of root.querySelectorAll('[data-locate]')) b.addEventListener('click', () => api.selectSlot(Number(b.dataset.locate)));
  for (const b of root.querySelectorAll('[data-refill]')) b.addEventListener('click', () => api.refill(Number(b.dataset.refill)));
}
