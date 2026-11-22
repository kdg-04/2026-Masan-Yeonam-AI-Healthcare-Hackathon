// 가족 탭: S7 구성원 조합 · 경고 모달 · S8 오늘 파우치
import { esc, memberOf, productOf, warningCard } from '../ui.js';
import { checkMember } from '../../engine/safety.js';
import { pouchesFor, pouchLabel } from '../../engine/schedule.js';

const TODAY = '2026-11-21';

export function render(s) {
  const ed = s.ui.editing;
  return `
  <header class="screen-head">
    <button class="back" data-go-menu>설정</button>
    <h1>가족 조합</h1>
    <p class="muted">구성원마다 먹을 제품과 개수를 정하면, 저장할 때 안전 검사를 하고 버튼 하나로 파우치가 나와요.</p>
  </header>
  <div class="members">
    ${s.members.map((m) => (ed?.memberId === m.id ? editor(s, m, ed) : card(s, m))).join('')}
  </div>
  ${inviteCard(s)}
  ${pouchSection(s)}
  ${s.ui.modal ? modal(s) : ''}`;
}

// 가족 초대 (데모: 코드를 보내면 잠시 뒤 수락 알림이 뜸)
/** 가족 안전 탭 맨 위: 고른 구성원의 조합 카드(편집 중이면 편집기) + 저장 전 경고 시트. 버튼 동작은 아래 bind 그대로 */
export function comboSection(s, m) {
  const ed = s.ui.editing;
  return (ed?.memberId === m.id ? editor(s, m, ed) : card(s, m)) + (s.ui.modal ? modal(s) : '');
}

function inviteCard(s) {
  const left = s.candidates?.length ?? 0;
  return `<section class="block" aria-labelledby="h-invite">
    <h2 id="h-invite">가족 초대</h2>
    <div class="member">
      <p class="muted">초대 코드를 가족에게 보내면, 가족이 앱에서 코드를 입력할 때 수락 알림이 와요.</p>
      <p class="dose" style="font-size:1.6em;letter-spacing:.06em">PUMX-4821</p>
      <div class="member__actions">
        <button class="btn" data-copy-invite>코드 복사</button>
        <button class="btn btn--primary" data-invite ${left ? '' : 'disabled'}>${left ? '초대 코드 보내기' : '모두 초대했어요'}</button>
      </div>
    </div>
  </section>`;
}

function card(s, m) {
  const preset = s.presets[m.id] ?? [];
  const pouches = pouchesFor(preset, s);
  const busy = s.ui.busy === 'dispense';
  return `<article class="member ${s.ui.member === m.id ? 'member--active' : ''}">
    <div class="member__head">
      <h2>${esc(m.title)} <span class="muted">${m.age}세</span></h2>
      ${s.ui.flags[m.id] ? '<span class="tag tag--caution">주의 표시</span>' : ''}
    </div>
    ${preset.length ? `<ul class="member__items">${preset.map((it) => { const p = productOf(s, it.productId); return p ? `<li><span class="pill-dot" style="--c:${p.color}"></span>${esc(p.name)} <span class="dose">×${it.count}</span></li>` : ''; }).join('')}</ul>` : '<p class="empty">조합이 비어 있어요.</p>'}
    <p class="muted">하루 ${pouches.length}봉지</p>
    <p class="consent">${esc(s.copy.shareConsent)}</p>
    <div class="member__actions">
      <button class="btn" data-edit="${m.id}">조합 편집</button>
      <button class="btn btn--primary" data-dispense="${m.id}" ${busy || !preset.length ? 'disabled' : ''}>${busy && s.ui.lastDispense?.memberId === m.id ? '배출 중' : '배출'}</button>
    </div>
  </article>`;
}

function editor(s, m, ed) {
  const inSlots = s.slots.filter((x) => x.productId).map((x) => ({ slot: x.slot, p: productOf(s, x.productId) }));
  return `<article class="member member--editing">
    <h2>${esc(m.title)} 조합 편집</h2>
    <ul class="pick">
      ${inSlots.map(({ slot, p }) => {
        const it = ed.items.find((x) => x.productId === p.id);
        return `<li class="pick__row">
          <label class="pick__label"><input type="checkbox" data-pick="${p.id}" ${it ? 'checked' : ''}><span class="dose">${slot}</span><span>${esc(p.name)}</span></label>
          <span class="stepper" ${it ? '' : 'hidden'}><button type="button" data-step="${p.id}" data-d="-1" aria-label="개수 줄이기">−</button><span class="dose">${it?.count ?? 1}</span><button type="button" data-step="${p.id}" data-d="1" aria-label="개수 늘리기">+</button></span>
        </li>`;
      }).join('')}
    </ul>
    <div class="member__actions">
      <button class="btn" data-cancel>취소</button>
      <button class="btn btn--primary" data-save="${m.id}">저장</button>
    </div>
  </article>`;
}

function modal(s) {
  const md = s.ui.modal;
  const m = memberOf(s, md.memberId);
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal__sheet">
      <h2 id="modal-title">${esc(m.title)} 조합을 저장하기 전에 확인하세요</h2>
      ${md.warnings.map(warningCard).join('')}
      <p class="footnote">${esc(s.copy.safetyFooter)}</p>
      <button class="btn btn--block" data-modal="consult">상담할 때 보여 줄 목록</button>
      <div class="member__actions">
        <button class="btn" data-modal="keep">그대로 저장</button>
        <button class="btn btn--primary" data-modal="remove">빼고 저장</button>
      </div>
    </div>
  </div>`;
}

function pouchSection(s) {
  const m = memberOf(s, s.ui.member);
  const pouches = pouchesFor(s.presets[m.id] ?? [], s);
  const today = s.ui.pouches;
  return `<section class="block" aria-labelledby="h-pouch">
    <h2 id="h-pouch">오늘 파우치</h2>
    <div class="labels">
      ${pouches.map((p) => `<div class="rx-label">
        <p class="rx-label__name">${esc(pouchLabel(m.title, p.round, TODAY))}</p>
        <ul>${p.items.map((it) => `<li><span>${esc(productOf(s, it.productId).name)}</span><span>${it.count}${esc(productOf(s, it.productId).form)}</span></li>`).join('')}</ul>
        ${s.logs.some((l) => l.date === TODAY && l.memberId === m.id && l.round === p.round && l.taken) ? '<span class="stamp">나옴</span>' : ''}
      </div>`).join('') || '<p class="empty">조합이 비어 있어요.</p>'}
    </div>
    <h3 class="sub-head">오늘 배출 기록</h3>
    ${today.length ? `<ul class="list">${today.map((t) => `<li><span>${esc(t.label)}</span><span class="dose">${new Date(t.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></li>`).join('')}</ul>` : '<p class="empty">오늘 나온 파우치가 아직 없어요.</p>'}
  </section>`;
}

/** 저장 전 검사: 새로 넣은 제품 때문에 생긴 위험·주의 경고와, 빼면 되는 제품 */
function review(s, memberId, items) {
  const before = s.presets[memberId] ?? [];
  const added = items.filter((it) => !before.some((b) => b.productId === it.productId)).map((it) => it.productId);
  const warnings = checkMember(memberId, items, s);
  const serious = warnings.filter((w) => w.level !== 'info');
  const remove = new Set();
  for (const w of serious) {
    if (w.type === 'allergy' || w.type === 'age') remove.add(w.key);
    else for (const id of added) if (productOf(s, id)?.nutrients.some((n) => n.key === w.key)) remove.add(id);
  }
  return { warnings: serious, remove: [...remove].filter((id) => added.includes(id)) };
}

export function bind(root, api, s) {
  root.querySelector('[data-go-menu]')?.addEventListener('click', () => api.go('menu'));
  root.querySelector('[data-invite]')?.addEventListener('click', () => api.sendInvite());
  root.querySelector('[data-copy-invite]')?.addEventListener('click', () => { navigator.clipboard?.writeText('PUMX-4821').catch(() => {}); });
  for (const b of root.querySelectorAll('[data-edit]')) b.addEventListener('click', () => {
    api.update((st) => { st.ui.member = b.dataset.edit; st.ui.editing = { memberId: b.dataset.edit, items: structuredClone(st.presets[b.dataset.edit] ?? []) }; });
  });
  for (const b of root.querySelectorAll('[data-dispense]')) b.addEventListener('click', () => { api.setMember(b.dataset.dispense); api.askDispense(b.dataset.dispense); });
  root.querySelector('[data-cancel]')?.addEventListener('click', () => api.set('ui.editing', null));
  for (const c of root.querySelectorAll('[data-pick]')) c.addEventListener('change', () => api.update((st) => {
    const items = st.ui.editing.items;
    if (c.checked) items.push({ productId: c.dataset.pick, count: 1 });
    else st.ui.editing.items = items.filter((x) => x.productId !== c.dataset.pick);
  }));
  for (const b of root.querySelectorAll('[data-step]')) b.addEventListener('click', () => api.update((st) => {
    const it = st.ui.editing.items.find((x) => x.productId === b.dataset.step);
    if (it) it.count = Math.max(1, Math.min(5, it.count + Number(b.dataset.d)));
  }));
  root.querySelector('[data-save]')?.addEventListener('click', () => {
    const memberId = s.ui.editing.memberId;
    const items = s.ui.editing.items;
    const r = review(s, memberId, items);
    if (!r.warnings.length) { api.savePreset(memberId, items); return; }
    api.set('ui.modal', { memberId, items, ...r });
  });
  for (const b of root.querySelectorAll('[data-modal]')) b.addEventListener('click', () => {
    const md = s.ui.modal;
    if (b.dataset.modal === 'consult') { // 명세서 14절 장면 5: 저장 전 조합으로 상담용 목록 → 돌아와 [빼고 저장]
      api.update((st) => { st.ui.consultFrom = { modal: md, editing: st.ui.editing }; st.ui.modal = null; st.ui.member = md.memberId; st.ui.tab = 'safety'; st.ui.sub = 'consult'; });
      document.querySelector('.app-main')?.scrollTo(0, 0);
      return;
    }
    if (b.dataset.modal === 'remove') api.savePreset(md.memberId, md.items, { remove: md.remove });
    else api.savePreset(md.memberId, md.items, { flag: true });
  });
}
