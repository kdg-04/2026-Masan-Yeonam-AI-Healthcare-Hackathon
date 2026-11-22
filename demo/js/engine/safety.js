// 안전 엔진 — 규칙만 사용 (AI 없음). 화면과 무관한 순수 함수.
// checkMember(memberId, presetItems, state, options) → Warning[]
// Warning = { type, level, key, title, message, pct?, evidence: { source, url?, value?, limit?, labelText? } }
import { fmt, round1 } from './text.js';

const LEVEL_ORDER = { danger: 0, caution: 1, info: 2 };
const TYPE_ORDER = { allergy: 0, drug: 1, upper: 2, duplicate: 3, age: 4 };

const productOf = (state, id) => state.products.find((p) => p.id === id);
const memberOf = (state, id) => state.members.find((m) => m.id === id);

/** 조합 안 제품들의 성분 합계: [{ key, label, unit, total, products: [productId] }] (처음 나온 순서) */
function sumNutrients(presetItems, state) {
  const totals = new Map();
  for (const item of presetItems) {
    const p = productOf(state, item.productId);
    if (!p) continue;
    for (const n of p.nutrients) {
      const t = totals.get(n.key) ?? { key: n.key, label: n.label, unit: n.unit, total: 0, products: [] };
      t.total = round1(t.total + n.amount * item.count * p.timesPerDay);
      if (!t.products.includes(p.id)) t.products.push(p.id);
      totals.set(n.key, t);
    }
  }
  return [...totals.values()];
}

function limitFor(state, key, age) {
  return state.limits.find((l) => l.key === key && age >= (l.ageMin ?? 0)) ?? null;
}

/** 성분별 막대: [{ key, label, unit, total, limit, pct (기준 없으면 null), limitLabel, verified, source }] */
export function memberTotals(memberId, presetItems, state) {
  const member = memberOf(state, memberId);
  return sumNutrients(presetItems, state).map((t) => {
    const lim = member ? limitFor(state, t.key, member.age) : null;
    return {
      key: t.key, label: t.label, unit: t.unit, total: t.total, productCount: t.products.length,
      limit: lim?.ul ?? null,
      pct: lim ? Math.round((t.total / lim.ul) * 100) : null,
      limitLabel: lim ? `${lim.ul}${lim.unit}` : state.copy.noLimit,
      verified: lim?.verified ?? null,
      source: lim?.source ?? null,
    };
  });
}

export function checkMember(memberId, presetItems, state, options = {}) {
  const member = memberOf(state, memberId);
  if (!member) return [];
  const c = state.copy;
  const warnings = [];
  const bars = memberTotals(memberId, presetItems, state);

  // 상한
  for (const b of bars) {
    if (b.pct === null || b.pct < 80) continue;
    const danger = b.pct >= 100;
    const vars = { label: b.label, total: b.total, unit: b.unit, limit: b.limit, pct: b.pct };
    warnings.push({
      type: 'upper', level: danger ? 'danger' : 'caution', key: b.key, pct: b.pct,
      title: fmt(danger ? c.upperDangerTitle : c.upperCautionTitle, vars),
      message: fmt(danger ? c.upperDanger : c.upperCaution, vars),
      evidence: { source: b.source, value: b.total, limit: b.limit, verified: b.verified },
    });
  }

  // 중복
  for (const b of bars) {
    if (b.productCount < 2) continue;
    const pctPart = b.pct === null ? '' : fmt(c.duplicatePct, { pct: b.pct });
    warnings.push({
      type: 'duplicate', level: 'info', key: b.key,
      title: fmt(c.duplicateTitle, { label: b.label }),
      message: fmt(c.duplicate, { label: b.label, count: b.productCount, total: b.total, unit: b.unit, pctPart }),
      evidence: { source: '제품 표시사항', value: b.total, limit: b.limit },
    });
  }

  // 알레르기
  for (const item of presetItems) {
    const p = productOf(state, item.productId);
    if (!p) continue;
    const hit = p.allergens.filter((a) => member.allergies.includes(a));
    for (const allergen of hit) {
      warnings.push({
        type: 'allergy', level: 'danger', key: p.id,
        title: c.allergyTitle,
        message: fmt(c.allergy, { allergen, member: member.title }),
        evidence: { source: '제품 표시사항', labelText: p.labelText },
      });
    }
  }

  // 먹는 약
  const meds = state.meds.filter((m) => m.memberId === memberId);
  for (const b of bars) {
    for (const med of meds) {
      const rule = state.interactions.find((r) => r.nutrientKey === b.key && r.drugClass === med.drugClass);
      if (!rule) continue;
      // 화면에는 성분(EPA·DHA) 대신 그 성분이 든 제품 이름을 보여 준다
      const names = presetItems.map((it) => productOf(state, it.productId))
        .filter((p) => p?.nutrients.some((n) => n.key === b.key)).map((p) => p.name);
      const product = [...new Set(names)].join(', ') || b.label;
      warnings.push({
        type: 'drug', level: rule.level, key: b.key,
        title: c.drugTitle,
        message: fmt(c.drug, { member: member.title, drug: med.name, product, reason: rule.reason, source: rule.source.replace(/ 정보그림 뉴스$/, '') }),
        evidence: { source: rule.source, url: rule.url },
      });
    }
  }

  // 섭취 대상 (Could — 옵션)
  if (options.ageCheck && member.age < 19) {
    for (const item of presetItems) {
      const p = productOf(state, item.productId);
      if (p?.target !== '성인') continue;
      warnings.push({
        type: 'age', level: 'info', key: p.id,
        title: c.ageTitle,
        message: fmt(c.age, { product: p.name, target: p.target }),
        evidence: { source: '제품 표시사항', labelText: p.labelText },
      });
    }
  }

  return warnings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}
