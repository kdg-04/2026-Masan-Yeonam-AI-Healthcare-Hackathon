// 안전 탭: S5 안전 리포트 · S6 먹는 약
import { esc, memberChips, memberOf, productOf, warningCard, sleep, LEVEL_LABEL, toast } from '../ui.js';
import { checkMember, memberTotals } from '../../engine/safety.js';
import { comboSection, bind as bindCombo } from './family.js';

/** 약사·의사에게 보여 줄 상담용 복용 목록 (판단 없이 사실만, 명세서 9절 S11·11절)
 *  가족 탭 경고 시트에서 열면 저장 전 조합(ui.consultFrom)을 보여 주고, 돌아가면 같은 시트로 */
function consult(s, m) {
  const from = s.ui.consultFrom?.modal?.memberId === m.id ? s.ui.consultFrom : null;
  const preset = from ? from.modal.items : (s.presets[m.id] ?? []);
  const bars = memberTotals(m.id, preset, s);
  const warnings = checkMember(m.id, preset, s);
  const meds = s.meds.filter((x) => x.memberId === m.id);
  const evidence = (w) => {
    const ev = w.evidence ?? {};
    return [
      ev.source && (ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.source)}</a>` : esc(ev.source)),
      ev.value != null && ev.limit != null && `하루 ${esc(ev.value)} / 상한 ${esc(ev.limit)}${ev.verified === false ? '(원문 확인 전)' : ''}`,
      ev.labelText && `표시사항: ${esc(ev.labelText)}`,
    ].filter(Boolean).join(' · ');
  };
  return `
  <header class="screen-head">
    ${from ? '<button class="back" data-consult-back>저장 전 확인으로</button>' : '<button class="back" data-sub="">안전 리포트</button>'}
    <h1>${esc(m.title)} 상담용 복용 목록</h1>
    <p class="muted">${esc(m.name)}(가상) · ${m.age}세 · 2026년 11월 21일 기준. 약국이나 진료실에서 이 화면을 보여 주세요.</p>
    ${from ? '<p class="tag tag--caution">아직 저장하지 않은 조합이에요</p>' : ''}
  </header>
  <section class="rx-sheet ${s.ui.consultLarge ? 'rx-sheet--large' : ''}">
    <h2>먹는 영양제</h2>
    <table class="rx-table"><thead><tr><th>제품</th><th>먹는 법</th><th>성분(1회)</th></tr></thead>
      <tbody>${preset.map((it) => { const p = productOf(s, it.productId); return p ? `<tr><td>${esc(p.name)}</td><td>1회 ${it.count}${esc(p.form)}, 하루 ${p.timesPerDay}회</td><td>${p.nutrients.map((n) => `${esc(n.label)} ${n.amount}${esc(n.unit)}`).join('<br>')}</td></tr>` : ''; }).join('')}</tbody></table>
    <h2>성분 하루 합계</h2>
    <table class="rx-table"><thead><tr><th>성분</th><th>하루 합계</th><th>상한 대비</th></tr></thead>
      <tbody>${bars.map((b) => `<tr><td>${esc(b.label)}</td><td class="num">${b.total}${esc(b.unit)}</td><td class="num">${b.pct === null ? esc(b.limitLabel) : `${b.pct}%`}</td></tr>`).join('')}</tbody></table>
    <h2>먹는 약</h2>
    ${meds.length ? `<ul class="rx-plain">${meds.map((d) => `<li>${esc(d.name)}, 하루 ${d.timesPerDay}회</li>`).join('')}</ul>` : '<p class="muted">등록된 약 없음</p>'}
    <h2>알레르기</h2>
    <p>${m.allergies?.length ? esc(m.allergies.join(', ')) : '<span class="muted">등록된 알레르기 없음</span>'}</p>
    <h2>앱이 표시한 확인 항목과 근거</h2>
    ${warnings.length ? `<ul class="rx-plain">${warnings.map((w) => `<li><strong>${LEVEL_LABEL[w.level]} · ${esc(w.title)}</strong><br><span class="muted">${evidence(w)}</span></li>`).join('')}</ul>` : '<p class="muted">없음</p>'}
  </section>
  <button class="btn btn--block" data-consult-large>${s.ui.consultLarge ? '원래 크기로' : '크게 보기'}</button>
  <p class="footnote"><strong>${esc(s.copy.consultFoot)}</strong> ${esc(s.copy.safetyFooter)}</p>`;
}

export function render(s) {
  const m = memberOf(s, s.ui.member);
  if (s.ui.sub === 'consult') return consult(s, m);
  const preset = s.presets[m.id] ?? [];
  const bars = memberTotals(m.id, preset, s);
  const warnings = checkMember(m.id, preset, s);
  const meds = s.meds.filter((x) => x.memberId === m.id);

  return `
  <header class="screen-head">
    <h1>가족 안전</h1>
    <p class="muted">구성원을 고르면 그 사람의 조합과, 성분을 하루 기준으로 더해 상한·표시사항·먹는 약과 대조한 결과를 한 번에 봐요.</p>
  </header>
  ${memberChips(s, m.id)}
  ${comboSection(s, m)}

  <section class="block" aria-labelledby="h-bars">
    <h2 id="h-bars">성분별 하루 합계</h2>
    ${bars.length ? `<ul class="bars">${bars.map((b) => `
      <li class="bar ${b.pct === null ? 'bar--none' : b.pct >= 100 ? 'bar--danger' : b.pct >= 80 ? 'bar--caution' : ''}">
        <div class="bar__head"><span>${esc(b.label)}</span><span class="dose">${b.total}${esc(b.unit)}${b.pct !== null ? ` / ${esc(b.limitLabel)}` : ''}</span></div>
        <div class="bar__track" aria-hidden="true"><span class="bar__fill" style="--v:${Math.min(b.pct ?? 0, 120) / 1.2}%"></span><span class="bar__mark" style="--at:${80 / 1.2}%"></span><span class="bar__mark" style="--at:${100 / 1.2}%"></span></div>
        <p class="bar__pct">${b.pct === null ? esc(b.limitLabel) : `상한의 ${b.pct}%`}</p>
      </li>`).join('')}</ul>` : '<p class="empty">조합이 비어 있어요. 가족 탭에서 조합을 만들면 여기서 합계를 볼 수 있어요.</p>'}
  </section>

  <section class="block" aria-labelledby="h-warn">
    <h2 id="h-warn">확인할 것 ${warnings.length}</h2>
    ${warnings.map(warningCard).join('')}
    <button class="btn btn--block" data-sub="consult">약사·의사에게 보여 줄 복용 목록</button>
  </section>

  <section class="block" aria-labelledby="h-meds">
    <div class="block__head"><h2 id="h-meds">먹는 약</h2></div>
    ${meds.length ? `<ul class="list">${meds.map((d) => `<li><span>${esc(d.name)}</span><span class="muted">하루 ${d.timesPerDay}회, ${esc(d.storage)}</span></li>`).join('')}</ul>` : '<p class="empty">등록된 약이 없어요.</p>'}
    ${s.ui.medReading ? `<div class="ai-scan" role="status"><div class="ai-scan__img"><img src="assets/labels/med-anticoagulant.svg" alt="약봉투 사진(가상)"><i class="ai-scan__line"></i></div>
      <div class="ai-scan__text"><b>AI가 약봉투를 읽고 있어요</b><small>Claude 비전 모델</small><ol class="ai-steps"><li>사진에서 글자 찾기</li><li>약품명·분류·복용법 정리</li><li>병용 주의 표와 대조 준비</li></ol></div></div>`
      : `<button class="btn btn--block btn--ai" id="add-med"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>AI로 약봉투 읽기</button><p class="footnote">사진을 찍으면 AI가 약품명·분류·복용법을 정리해요. 판단은 규칙과 약사·의사가 해요.</p>`}
  </section>

  <p class="footnote">${esc(s.copy.safetyFooter)}</p>
  ${medSheets(s, m)}`;
}

/** 약봉투 등록: ① 민감정보 동의 시트 → ② 판독 결과 시트(AI가 읽은 원문 → 정리한 값, 확인 필요) */
function medSheets(s, m) {
  if (s.ui.medConsent) return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="consent-title"><div class="modal__sheet">
    <h2 id="consent-title">건강정보(민감정보) 수집·이용 동의</h2>
    <p class="muted">${esc(m.title)} 님의 먹는 약을 등록하려면 동의가 필요해요. (가상 데이터 데모)</p>
    <ul class="rx-plain">
      <li><b>수집 항목</b> 약봉투 사진, 약품명·분류·복용법</li>
      <li><b>이용 목적</b> 영양제와 함께 먹을 때 주의할 점 확인, 약사·의사 상담용 목록</li>
      <li><b>보관</b> 이 기기·앱 안 (데모는 새로고침하면 지워져요)</li>
      <li><b>가족 공유</b> 본인이 동의한 가족에게만, 복용 약과 경고만</li>
      <li><b>만 14세 미만</b> 법정대리인 동의가 필요해요</li>
    </ul>
    <p class="footnote">동의하지 않아도 영양제 관리는 쓸 수 있어요. 먹는 약 대조만 빠져요.</p>
    <div class="member__actions"><button class="btn" data-consent="no">동의하지 않음</button><button class="btn btn--primary" data-consent="yes">동의하고 계속</button></div>
  </div></div>`;
  const r = s.ui.medResult;
  if (!r) return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="medread-title"><div class="modal__sheet">
    <p class="read-notes__badge">${esc(r.model ? `${s.copy.ocrBadge} · ${r.model}` : s.copy.ocrBadgeManual)}</p>
    <div class="ai-result-head"><img class="ai-thumb" src="assets/labels/med-anticoagulant.svg" alt="약봉투 사진(가상)"><h2 id="medread-title">AI가 약봉투를 읽었어요</h2></div>
    <div class="read-notes"><ul>
      <li class="read-notes__head" aria-hidden="true"><span>봉투 원문</span><span>정리한 값</span></li>
      ${(r.readNotes ?? []).map((n) => `<li class="${n.confirm ? 'read-notes__confirm' : ''}"><span class="read-notes__raw">${esc(n.raw)}</span><span class="read-notes__read">${esc(n.read)}${n.confirm ? '<em class="read-notes__flag">확인 필요</em>' : ''}</span>${n.note ? `<span class="read-notes__note">${esc(n.note)}</span>` : ''}</li>`).join('')}
    </ul></div>
    <p class="footnote">${esc(s.copy.ocrFoot)} 약 복용은 바꾸지 말고, 궁금한 점은 약사·의사와 상담하세요.</p>
    <div class="member__actions"><button class="btn" data-medread="no">취소</button><button class="btn btn--primary" data-medread="yes">맞아요, ${esc(m.title)} 약으로 등록</button></div>
  </div></div>`;
}

export function bind(root, api, s) {
  if (!s.ui.sub) bindCombo(root, api, s); // 조합 편집·배출·경고 시트 (가족 화면과 같은 동작)
  for (const b of root.querySelectorAll('[data-sub]')) b.addEventListener('click', () => api.go('safety', b.dataset.sub || null));
  root.querySelector('[data-consult-large]')?.addEventListener('click', () => api.set('ui.consultLarge', !s.ui.consultLarge));
  root.querySelector('[data-consult-back]')?.addEventListener('click', () => { // 가족 탭의 같은 경고 시트로
    const from = s.ui.consultFrom;
    api.update((st) => { st.ui.tab = 'safety'; st.ui.sub = null; st.ui.editing = from.editing; st.ui.modal = from.modal; st.ui.consultFrom = null; st.ui.consultLarge = false; });
  });
  const readMed = async () => {
    api.set('ui.medReading', true);
    await sleep(2400); // 스캔·단계 애니메이션이 끝날 만큼
    api.update((st) => { st.ui.medReading = false; st.ui.medResult = structuredClone(st.ocr['med-anticoagulant.svg']); });
  };
  // 약봉투 등록: 처음 한 번은 민감정보 동의부터 (동의는 시나리오 초기화 전까지 유지)
  root.querySelector('#add-med')?.addEventListener('click', () => (s.ui.consents?.health ? readMed() : api.set('ui.medConsent', true)));
  for (const b of root.querySelectorAll('[data-consent]')) b.addEventListener('click', () => {
    const yes = b.dataset.consent === 'yes';
    api.update((st) => { st.ui.medConsent = false; if (yes) st.ui.consents = { ...st.ui.consents, health: true }; });
    if (yes) readMed(); else toast('동의하지 않아 약은 등록하지 않았어요');
  });
  for (const b of root.querySelectorAll('[data-medread]')) b.addEventListener('click', () => {
    const r = s.ui.medResult;
    if (b.dataset.medread !== 'yes' || !r) { api.set('ui.medResult', null); return; }
    const who = memberOf(s, s.ui.member);
    api.update((st) => {
      st.meds = st.meds.filter((x) => !(x.memberId === st.ui.member && x.id === r.id)).concat({ ...r, memberId: st.ui.member });
      st.ui.medResult = null;
    });
    toast(`${who.title} 먹는 약에 ${r.name}을 등록했어요`);
  });
}
