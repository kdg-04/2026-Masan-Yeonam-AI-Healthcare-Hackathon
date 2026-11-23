// 영양제 탭: S4 내 영양제(12칸) · S2 등록 · S3 칸 배정
import { esc, productOf, memberOf, sleep, icon, toast } from '../ui.js';
import { renderDetail, bindDetail } from './detail.js';
import { remainingDays, usersOf } from '../../engine/slots.js';
import { checkMember } from '../../engine/safety.js';
import { withJosa, fmt } from '../../engine/text.js';

const LABELS = [{ file: 'label-probiotics.svg', title: '유산균 라벨' }];
const STORAGE = { cool: '서늘하고 건조한 곳', dry: '건조한 곳 (기기가 칸 습도 관리)' };

export function render(s) {
  if (s.ui.sub === 'register') return renderRegister(s);
  if (s.ui.sub === 'assign') return renderAssign(s);
  if (s.ui.sub === 'detail') return renderDetail(s);
  return renderSlots(s);
}

function renderSlots(s) {
  return `
  <header class="screen-head">
    <h1>내 영양제</h1>
    <p class="muted">기기 12칸에 들어 있는 제품이에요. 칸을 누르면 기기에서도 그 칸이 빛나요.</p>
  </header>
  <ol class="slots">
    ${s.slots.map((x) => {
      const p = productOf(s, x.productId);
      if (!p) return `<li class="slot slot--empty"><span class="slot__no dose">${x.slot}</span><span class="muted">빈 칸</span></li>`;
      const days = remainingDays(p.id, s);
      const users = usersOf(p.id, s).map((id) => memberOf(s, id).title).join(', ');
      const pct = Math.min(100, Math.round((x.remaining / 60) * 100));
      return `<li><button class="slot" data-slot="${x.slot}" aria-pressed="${s.ui.highlightSlot === x.slot}">
        <span class="slot__no dose">${x.slot}</span>
        <span class="slot__name"><span class="pill-dot" style="--c:${p.color}"></span>${esc(p.name)}</span>
        <span class="meter" style="--v:${pct}%"><span></span></span>
        <span class="slot__meta"><span class="dose">${x.remaining}개</span>${days !== null ? `<span class="${days <= 9 ? 'warn-text' : ''}">${days}일분</span>` : ''}</span>
        <span class="slot__meta muted"><span class="dose">습도 ${x.humidity}%</span>${users ? `<span>${esc(users)}</span>` : ''}</span>
      </button></li>`;
    }).join('')}
  </ol>
  <div class="dock-space" aria-hidden="true"></div>
  <div class="dock-action"><button class="btn btn--primary btn--block" data-sub="register">새 영양제 등록</button></div>`;
}

function renderRegister(s) {
  const r = s.ui.reg ?? {};
  if (r.reading) {
    return `<header class="nav-head"><button class="circle-btn" data-sub="" aria-label="닫기">${icon('x')}</button><h1>영양제 등록</h1><span class="circle-btn circle-btn--ghost"></span></header>
      <div class="steps" aria-label="1단계 / 3단계"><span class="steps__bar"><i class="on"></i><i class=""></i><i class=""></i></span><p><span>1단계 / 3단계</span><b>라벨 사진</b></p></div>` + `
      <div class="ai-scan" role="status"><div class="ai-scan__img"><img src="assets/labels/label-probiotics.svg" alt="영양제 라벨 사진(가상)"><i class="ai-scan__line"></i></div>
      <div class="ai-scan__text"><b>AI가 라벨을 읽고 있어요</b><small>Claude 비전 모델</small><ol class="ai-steps"><li>사진에서 글자 찾기</li><li>성분·단위·알레르기 정리</li><li>영어 단위를 우리말로 바꾸기</li></ol></div></div>`;
  }
  if (!r.product) {
    return `<header class="nav-head"><button class="circle-btn" data-sub="" aria-label="닫기">${icon('x')}</button><h1>영양제 등록</h1><span class="circle-btn circle-btn--ghost"></span></header>
      <div class="steps" aria-label="1단계 / 3단계"><span class="steps__bar"><i class="on"></i><i class=""></i><i class=""></i></span><p><span>1단계 / 3단계</span><b>라벨 사진</b></p></div>` + `<header class="screen-head"><p class="muted">제품 라벨 사진을 고르면 내용을 읽어 와요. 읽은 값은 저장 전에 고칠 수 있어요.</p></header>
      <div class="label-pick"><button class="label-thumb label-thumb--new" data-new-label><span class="new-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 7v10M7 12h10"/></svg></span><span>새로 등록하기</span><small>카메라로 라벨 찍기</small></button>
        ${LABELS.map((l) => `<button class="label-thumb" data-label="${l.file}"><img src="assets/labels/${l.file}" alt="${l.title} 사진(가상)"><span>${l.title}</span></button>`).join('')}</div>`;
  }
  const p = r.product;
  const byAi = Boolean(p.model); // 비전 AI가 실제로 읽은 결과일 때만 'AI' 표기 (명세서 12절)
  const toConfirm = (p.readNotes ?? []).filter((n) => n.confirm).length;
  const preview = checkMember(r.memberId, [...(s.presets[r.memberId] ?? []), { productId: p.id, count: p.servingCount }], { ...s, products: [...s.products.filter((x) => x.id !== p.id), p] });
  return `<header class="nav-head"><button class="circle-btn" data-sub="" aria-label="닫기">${icon('x')}</button><h1>영양제 등록</h1><span class="circle-btn circle-btn--ghost"></span></header>
      <div class="steps" aria-label="2단계 / 3단계"><span class="steps__bar"><i class="on"></i><i class="on"></i><i class=""></i></span><p><span>2단계 / 3단계</span><b>내용 확인</b></p></div>` + `
  <form class="form" id="reg-form">
    ${p.readNotes ? `<div class="read-notes">
      <p class="read-notes__badge">${esc(byAi ? s.copy.ocrBadge : s.copy.ocrBadgeManual)}</p>
      <p class="read-notes__title">${esc(fmt(byAi ? s.copy.ocrHead : s.copy.ocrHeadManual, { count: toConfirm }))}</p>
      <ul>
        <li class="read-notes__head" aria-hidden="true"><span>라벨 원문 (영어)</span><span>정리한 값</span></li>
        ${p.readNotes.map((n, i) => `<li class="${n.confirm ? 'read-notes__confirm' : ''}">
        <span class="read-notes__raw">${esc(n.raw)}</span><span class="read-notes__read">${esc(n.read)}${n.confirm ? '<em class="read-notes__flag">확인 필요</em>' : ''}</span>
        ${n.note ? `<span class="read-notes__note">${esc(n.note)}</span>` : ''}
        ${n.confirm ? `<label class="check"><input type="checkbox" name="confirm-${i}" required> 라벨과 비교했어요, 맞아요</label>` : ''}
      </li>`).join('')}</ul>
      <p class="footnote">${esc(s.copy.ocrFoot)} 틀린 값은 아래 칸에서 고칠 수 있어요.</p>
    </div>` : ''}
    <label class="field"><span>제품명</span><input name="name" value="${esc(p.name)}" required></label>
    <div class="field-row">
      <label class="field"><span>1회 개수</span><input name="servingCount" type="number" min="1" max="5" value="${p.servingCount}"></label>
      <label class="field"><span>1일 횟수</span><input name="timesPerDay" type="number" min="1" max="3" value="${p.timesPerDay}"></label>
    </div>
    <div class="label-card">
      <p class="label-card__title">성분표 (1${esc(p.form)}당)</p>
      <ul>${p.nutrients.map((n) => `<li><span>${esc(n.label)}</span><span class="dose">${n.amount} ${esc(n.unit)}</span></li>`).join('')}</ul>
      <p><span class="muted">알레르기 표시</span> ${p.allergens.length ? `<strong>${esc(p.allergens.join(', '))} 함유</strong>` : '없음'}</p>
      <p><span class="muted">보관 방법</span> ${STORAGE[p.storage]}</p>
      <p><span class="muted">섭취 대상</span> ${esc(p.target)}</p>
    </div>
    <label class="field"><span>쓰는 사람</span>
      <select name="memberId">${s.members.map((m) => `<option value="${m.id}" ${m.id === r.memberId ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select>
    </label>
    ${preview.filter((w) => w.level === 'danger').map((w) => `<p class="inline-warn">${esc(w.message)}</p>`).join('')}
    <button class="btn btn--primary btn--block" type="submit">저장하고 칸 배정</button>
  </form>`;
}

function renderAssign(s) {
  const pd = s.ui.pending;
  if (!pd) return renderSlots(s);
  const p = productOf(s, pd.productId);
  return `<header class="nav-head"><button class="circle-btn" data-sub="" aria-label="닫기">${icon('x')}</button><h1>영양제 등록</h1><span class="circle-btn circle-btn--ghost"></span></header>
      <div class="steps" aria-label="3단계 / 3단계"><span class="steps__bar"><i class="on"></i><i class="on"></i><i class="on"></i></span><p><span>3단계 / 3단계</span><b>칸 배정</b></p></div>` + `
  <div class="assign plastic">
    <p class="assign__slot"><span class="dose">${pd.slot}</span><span>번 칸</span></p>
    <p>${esc(pd.message)}</p>
  </div>
  <p class="muted">${esc(withJosa(p.name, '을/를'))} 기기 가운데 투입통에 넣으면 원판이 돌아 ${pd.slot}번 칸으로 옮겨요.</p>
  ${pd.loaded
    ? `<p class="done">${pd.slot}번 칸에 넣었어요.</p><button class="btn btn--primary btn--block" data-go="safety">${esc(memberOf(s, pd.memberId).title)} 안전 리포트 보기</button><button class="btn btn--block" data-sub="">내 영양제로</button>`
    : `<button class="btn btn--primary btn--block" id="load" ${s.ui.busy ? 'disabled' : ''}>${s.ui.busy === 'load' ? '기기가 옮기는 중' : '가운데 투입통에 넣기'}</button>`}`;
}

export function bind(root, api, s) {
  for (const b of root.querySelectorAll('[data-sub]')) b.addEventListener('click', () => { api.update((st) => { st.ui.sub = b.dataset.sub || null; st.ui.reg = null; }); });
  for (const b of root.querySelectorAll('[data-go]')) b.addEventListener('click', () => { if (b.dataset.go === 'safety') api.setMember(s.ui.pending?.memberId ?? s.ui.member); api.go(b.dataset.go); });
  for (const b of root.querySelectorAll('[data-slot]')) b.addEventListener('click', () => { api.selectSlot(Number(b.dataset.slot)); api.update((st) => { st.ui.detailSlot = Number(b.dataset.slot); st.ui.sub = 'detail'; }); });
  bindDetail(root, api);
  // 데모에는 준비된 라벨 사진만 있다. 실제 촬영 기능이 있는 것처럼 보이지 않게 안내만 한다
  root.querySelector('[data-new-label]')?.addEventListener('click', () => toast('실제 앱에서는 카메라로 라벨을 찍어 등록해요. 데모에서는 준비된 유산균 라벨로 보여 드려요.'));
  for (const b of root.querySelectorAll('[data-label]')) b.addEventListener('click', async () => {
    api.set('ui.reg', { reading: true });
    await sleep(2400); // 스캔·단계 애니메이션이 끝날 만큼
    const product = { ...structuredClone(s.ocr[b.dataset.label]), labelImage: `assets/labels/${b.dataset.label}` }; // 넣기 장면의 통 라벨로 같은 사진을 씀
    api.set('ui.reg', { product, memberId: s.members.some((m) => m.id === 'mom') ? 'mom' : s.ui.member }); // 시연 유산균은 엄마 것(엄마가 아직 초대 전이면 지금 고른 사람)
  });
  const form = root.querySelector('#reg-form');
  form?.addEventListener('change', (e) => { if (e.target.name === 'memberId') api.set('ui.reg', { ...s.ui.reg, memberId: e.target.value }); });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const product = { ...s.ui.reg.product, name: String(fd.get('name')).trim() || s.ui.reg.product.name, servingCount: Number(fd.get('servingCount')) || 1, timesPerDay: Number(fd.get('timesPerDay')) || 1 };
    api.set('ui.reg', null);
    api.registerProduct(product, String(fd.get('memberId')));
  });
  root.querySelector('#load')?.addEventListener('click', () => api.loadIntoDevice());
}
