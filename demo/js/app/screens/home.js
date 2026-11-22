// S1 홈 — 레퍼런스: 인사 헤더 · 요일 줄 · 다음 파우치 카드(링) · 오늘 일정 목록
import { esc, memberOf, productOf, icon, tile, ring, memberChips } from '../ui.js';
import { pouchesFor, ROUND_TIME, ROUND_NAME } from '../../engine/schedule.js';
import { checkMember } from '../../engine/safety.js';
import { remainingDays } from '../../engine/slots.js';
import { outingCard } from '../outing.js';

const TODAY = '2026-11-21';
const WEEK = [['월', 16], ['화', 17], ['수', 18], ['목', 19], ['금', 20], ['토', 21], ['일', 22]];

function weekStrip(s, memberId) {
  const allTaken = (d) => {
    const iso = `2026-11-${String(d).padStart(2, '0')}`;
    const rows = s.logs.filter((l) => l.date === iso && l.memberId === memberId);
    return rows.length && rows.every((l) => l.taken);
  };
  return `<div class="week glass" role="list" aria-label="이번 주">
    ${WEEK.map(([w, d]) => `<div class="week__day ${d === 21 ? 'is-today' : ''}" role="listitem">
      <span class="week__w">${w}</span><span class="week__d">${d}</span><span class="week__dot ${d < 21 && allTaken(d) ? 'is-done' : d === 21 ? 'is-now' : ''}"></span></div>`).join('')}
  </div>`;
}

export function render(s) {
  const m = memberOf(s, s.ui.member);
  const preset = s.presets[m.id] ?? [];
  const pouches = pouchesFor(preset, s);
  const warnings = checkMember(m.id, preset, s);
  const taken = (round) => s.logs.some((l) => l.date === TODAY && l.memberId === m.id && l.round === round && l.taken);
  const doneCount = pouches.filter((p) => taken(p.round)).length;
  const next = pouches.find((p) => !taken(p.round));
  const runOut = s.slots.filter((x) => x.productId).map((x) => ({ p: productOf(s, x.productId), days: remainingDays(x.productId, s) }))
    .filter((r) => r.days !== null && r.days <= 14).sort((a, b) => a.days - b.days)[0];
  const busy = s.ui.busy === 'dispense';

  return `
  <header class="hello">
    <span class="avatar">${esc(m.title.slice(0, 1))}</span>
    <h1 class="hello__title">안녕하세요, ${esc(m.title)}</h1>
    <button class="icon-btn" data-go="safety" aria-label="확인할 것 ${warnings.length}개">${icon('bell')}${warnings.length ? '<span class="icon-btn__dot"></span>' : ''}</button>
  </header>

  ${memberChips(s, m.id)}

  ${weekStrip(s, m.id)}

  <section class="hero-card" aria-label="다음 파우치">
    ${ring(doneCount, pouches.length, '봉지')}
    <div class="hero-card__body">
      <p class="hero-card__eyebrow">${next ? `다음 파우치 ${ROUND_TIME[next.round]}` : '오늘 파우치를 다 받았어요'}</p>
      <h2 class="hero-card__title">${next ? `${esc(m.title)} ${next.round}회차` : `${esc(m.title)} 오늘 완료`}</h2>
      <p class="hero-chip">${icon('clock')}${next ? `${next.items.length}종 · 기기 ${next.items.filter((i) => i.slot != null).map((i) => i.slot).join('·') || '-'}번 칸` : `${pouches.length}봉지 받음`}</p>
    </div>
    <div class="hero-card__actions">
      <button class="pill-btn pill-btn--light" data-dispense="${m.id}" ${busy || !next ? 'disabled' : ''}>${busy ? '기기 동작 중' : '지금 배출'}</button>
      <button class="pill-btn pill-btn--navy" data-go="safety">${warnings.length ? `확인할 것 ${warnings.length}` : '안전 리포트'}</button>
    </div>
  </section>

  ${outingCard(s)}

  <section class="sched" aria-labelledby="h-sched">
    <div class="sec-head"><h2 id="h-sched">오늘 일정</h2><button class="link" data-go="family">편집</button></div>
    ${pouches.length ? pouches.map((p) => `
      <p class="sched__when">${icon(p.round === 2 ? 'moon' : 'sun')}<b>${ROUND_NAME[p.round]}</b> ${ROUND_TIME[p.round]}</p>
      <ul class="sched__list glass">
        ${p.items.map((it) => { const pr = productOf(s, it.productId); return `<li class="row">
          ${tile(pr.color, pr.form === '캡슐' ? 'pill' : 'tablet')}
          <span class="row__main"><b>${esc(pr.name.replace(/\(가상[^)]*\)/, '').trim())}</b><small>${it.slot != null ? `${it.slot}번 칸` : '기기에 넣기 전'} · ${it.count}${esc(pr.form)}</small></span>
          ${taken(p.round) ? `<span class="done-chip">${icon('check')}나옴</span>` : '<span class="wait-chip">대기</span>'}
        </li>`; }).join('')}
      </ul>`).join('') : `<p class="empty glass">아직 조합이 없어요. 가족 탭에서 만들어 주세요</p>`}
  </section>

  ${runOut ? `<button class="notice glass" data-go="supplements">${tile('orange', 'box', 'tile--sm')}<span><b>${esc(runOut.p.name.replace(/\(가상[^)]*\)/, '').trim())}</b> ${runOut.days}일 뒤 떨어져요</span>${icon('back', 'ic ic--flip')}</button>` : ''}`;
}

export function bind(root, api) {
  for (const b of root.querySelectorAll('[data-go]')) b.addEventListener('click', () => api.go(b.dataset.go, b.dataset.sub ?? null));
  for (const b of root.querySelectorAll('[data-dispense]')) b.addEventListener('click', () => api.askDispense(b.dataset.dispense)); // 집에서·컵 / 외출·파우치 고르는 시트
}
