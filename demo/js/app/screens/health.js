// 건강 탭: S9 건강(30일 그래프 + 영양소 안내) · S10 기록(복용률, 요약, 소진 예측)
// 그래프: 지표마다 따로(축 하나), 선 2px, 마지막 점만 값 표시, 포인터로 십자선·툴팁, 표로 보기
import { esc, memberChips, memberOf } from '../ui.js';
import { guideCards } from '../../engine/guide.js';
import { adherence, insightLines } from '../../engine/insight.js';
import { patternOf, patternChart, koTime } from '../outing.js';

const W = 320, H = 96, PAD = { l: 34, r: 10, t: 10, b: 20 };

function chart(id, title, unit, points, { band14 = false, digits = 0 } = {}) {
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.v);
  const min = Math.min(...ys), max = Math.max(...ys);
  const lo = min - (max - min) * 0.15 || min - 1, hi = max + (max - min) * 0.15 || max + 1;
  const x = (i) => PAD.l + (i / Math.max(1, xs.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points.at(-1);
  const fmt = (v) => v.toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const bandX = band14 && points.length > 14 ? x(points.length - 14) : null;
  const dateLabel = (iso) => iso.slice(5).replace('-', '/');
  return `<figure class="chart" data-chart="${id}">
    <figcaption><span class="chart__title">${esc(title)}</span><span class="chart__last"><span class="num">${fmt(last.v)}</span>${esc(unit)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} ${points.length}회 기록, 마지막 ${fmt(last.v)}${esc(unit)}" data-points='${esc(JSON.stringify(points.map((p, i) => [x(i), y(p.v), p.date, fmt(p.v)])))}' data-unit="${esc(unit)}">
      ${bandX ? `<rect class="chart__band" x="${bandX}" y="${PAD.t}" width="${W - PAD.r - bandX}" height="${H - PAD.t - PAD.b}"></rect><text class="chart__band-label" x="${W - PAD.r - 4}" y="${PAD.t + 11}" text-anchor="end">최근 2주</text>` : ''}
      <line class="chart__grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(max)}" y2="${y(max)}"></line>
      <line class="chart__grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(min)}" y2="${y(min)}"></line>
      <text class="chart__axis" x="${PAD.l - 6}" y="${y(max) + 3}" text-anchor="end">${fmt(max)}</text>
      <text class="chart__axis" x="${PAD.l - 6}" y="${y(min) + 3}" text-anchor="end">${fmt(min)}</text>
      <text class="chart__axis" x="${PAD.l}" y="${H - 4}">${dateLabel(points[0].date)}</text>
      <text class="chart__axis" x="${W - PAD.r}" y="${H - 4}" text-anchor="end">${dateLabel(last.date)}</text>
      <path class="chart__line" d="${d}"></path>
      ${points.length <= 6 ? points.map((p, i) => `<circle class="chart__dot" cx="${x(i)}" cy="${y(p.v)}" r="4"></circle>`).join('') : `<circle class="chart__dot" cx="${x(points.length - 1)}" cy="${y(last.v)}" r="4"></circle>`}
      <line class="chart__cross" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" hidden></line>
    </svg>
    <p class="chart__tip" hidden></p>
    <details class="chart__table"><summary>표로 보기</summary>
      <table><thead><tr><th>날짜</th><th>${esc(title)}</th></tr></thead>
      <tbody>${points.map((p) => `<tr><td>${dateLabel(p.date)}</td><td class="num">${fmt(p.v)}${esc(unit)}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

function renderHealth(s, m) {
  const h = s.health[m.id];
  const daily = h.daily, ib = h.inbody;
  const cards = guideCards(m.id, s);
  return `
  <section class="block" aria-labelledby="h-watch">
    <h2 id="h-watch">워치 30일 <span class="muted">(가상)</span></h2>
    ${chart('steps', '걸음', '걸음', daily.map((d) => ({ date: d.date, v: d.steps })))}
    ${chart('outdoor', '실외 운동 시간', '분', daily.map((d) => ({ date: d.date, v: d.outdoorMin })), { band14: true })}
    ${chart('sleep', '수면', '시간', daily.map((d) => ({ date: d.date, v: d.sleepH })), { digits: 1 })}
  </section>
  ${lunchBlock(s, m)}
  <section class="block" aria-labelledby="h-inbody">
    <h2 id="h-inbody">인바디 4회 <span class="muted">(가상)</span></h2>
    ${chart('weight', '체중', 'kg', ib.map((d) => ({ date: d.date, v: d.weightKg })), { digits: 1 })}
    ${chart('muscle', '골격근량', 'kg', ib.map((d) => ({ date: d.date, v: d.muscleKg })), { digits: 1 })}
    ${chart('fat', '체지방률', '%', ib.map((d) => ({ date: d.date, v: d.fatPct })), { digits: 1 })}
  </section>
  <section class="block" aria-labelledby="h-guide">
    <h2 id="h-guide">${esc(s.copy.guideTitle ?? '영양소 안내')}</h2>
    ${cards.length ? cards.map((c) => `<article class="guide plastic" style="--t: var(--p-fri)">
      <p>${esc(c.message)}</p>
      <details class="warn__ev"><summary>근거 보기</summary><dl><div><dt>출처</dt><dd>${esc(c.source)}</dd></div></dl></details>
    </article>`).join('') : '<p class="empty">지금 기록에서 안내할 내용이 없어요.</p>'}
  </section>`;
}

/** 워치 10분 기록(14일)으로 본 점심 식사 패턴 — 외출 파우치 'AI 맞춤 알람'에 쓰임 */
function lunchBlock(s, m) {
  const p = patternOf(s, m.id);
  if (!p) return '';
  return `<section class="block" aria-labelledby="h-lunch">
    <h2 id="h-lunch">점심 식사 패턴 <span class="muted">(가상 · 워치 10분 기록 ${p.days}일)</span></h2>
    <figure class="chart">
      <figcaption><span class="chart__title">식사가 끝난 추정 시각</span>${p.ok ? `<span class="chart__last">평소 <span class="num">${koTime(p.usual)}</span></span>` : ''}</figcaption>
      ${p.ok ? patternChart(p) : '<p class="empty">추정된 날이 5일보다 적어요.</p>'}
      <p class="footnote">걸음이 줄고 심박이 조금 오른 구간을 식사로 추정했어요(정해 둔 규칙으로 계산, 진단 아님). 외출 파우치의 'AI 맞춤 알람'이 이 시간을 써요.</p>
    </figure>
  </section>`;
}

function renderLog(s) {
  const lines = insightLines(s);
  return `
  <section class="block" aria-labelledby="h-rate">
    <h2 id="h-rate">최근 4주 복용률</h2>
    <ul class="bars">${s.members.map((m) => { const r = adherence(m.id, s.logs) ?? 0; return `
      <li class="bar"><div class="bar__head"><span>${esc(m.title)}</span><span class="dose">${r}%</span></div>
      <div class="bar__track" aria-hidden="true"><span class="bar__fill" style="--v:${r}%"></span></div></li>`; }).join('')}</ul>
  </section>
  <section class="block" aria-labelledby="h-insight">
    <h2 id="h-insight">요약</h2>
    ${lines.length ? `<ul class="insights">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="empty">특별히 볼 패턴이 없어요.</p>'}
    <p class="footnote">숫자는 기록에서 계산했고, 문장은 정해진 틀로 만들었어요.</p>
  </section>`;
}

export function render(s) {
  const m = memberOf(s, s.ui.member);
  const sub = s.ui.sub === 'log' ? 'log' : 'health';
  return `
  <header class="screen-head"><h1>${sub === 'log' ? '복용 기록' : `${esc(m.title)} 건강`}</h1></header>
  <div class="segmented" role="tablist">
    <button role="tab" data-sub="health" aria-selected="${sub === 'health'}">건강</button>
    <button role="tab" data-sub="log" aria-selected="${sub === 'log'}">기록</button>
  </div>
  ${sub === 'log' ? renderLog(s) : `${memberChips(s, m.id)}${renderHealth(s, m)}`}`;
}

export function bind(root, api) {
  for (const b of root.querySelectorAll('[data-sub]')) b.addEventListener('click', () => api.go('health', b.dataset.sub));
  for (const svg of root.querySelectorAll('svg[data-points]')) {
    const pts = JSON.parse(svg.dataset.points);
    const cross = svg.querySelector('.chart__cross');
    const tip = svg.parentElement.querySelector('.chart__tip');
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      const p = pts.reduce((a, b) => (Math.abs(b[0] - vx) < Math.abs(a[0] - vx) ? b : a));
      cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.hidden = false;
      tip.textContent = `${p[2].slice(5).replace('-', '/')}  ${p[3]}${svg.dataset.unit}`;
      tip.hidden = false;
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { cross.hidden = true; tip.hidden = true; });
  }
}
