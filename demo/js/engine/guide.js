// 영양소 안내 카드: guide-rules.json 조건 검사. 지금 섭취량·상한 대비 %를 먼저 보여 줌
import { fmt, round1 } from './text.js';
import { memberTotals } from './safety.js';

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const CHECKS = {
  G01(memberId, state) {
    const daily = state.health[memberId]?.daily ?? [];
    if (daily.length < 28) return null;
    const recent = avg(daily.slice(-14).map((d) => d.outdoorMin));
    const prev = avg(daily.slice(0, -14).map((d) => d.outdoorMin));
    if (!(recent <= prev * 0.5)) return null;
    const bar = memberTotals(memberId, state.presets[memberId] ?? [], state).find((b) => b.key === 'vitD');
    return { total: bar?.total ?? 0, pct: bar?.pct ?? 0, count: bar?.productCount ?? 0, limit: bar?.limit ?? '-', recent: round1(recent), prev: round1(prev) };
  },
  G02(memberId, state) {
    const ib = state.health[memberId]?.inbody ?? [];
    if (ib.length < 4) return null;
    const last = ib.slice(-4).map((x) => x.muscleKg);
    if (!last.every((v, i) => i === 0 || v < last[i - 1])) return null;
    return { from: last[0], to: last.at(-1) };
  },
};

export function guideCards(memberId, state) {
  return state.guideRules
    .map((rule) => {
      const vars = CHECKS[rule.id]?.(memberId, state);
      if (!vars) return null;
      return { id: rule.id, nutrientKey: rule.nutrientKey, metric: rule.metric, message: fmt(state.copy[rule.copyKey], vars), source: rule.source, vars };
    })
    .filter(Boolean);
}
