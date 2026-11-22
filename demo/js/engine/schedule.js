// 회차 계산: 하루 봉지 수 = 조합 제품 timesPerDay 최댓값, n회차에는 timesPerDay ≥ n 인 제품만

/** 회차별 복용 시간(데모 고정값)과 이름 */
export const ROUND_TIME = { 1: '오전 8:00', 2: '오후 8:00', 3: '오후 1:00' };
export const ROUND_NAME = { 1: '아침', 2: '저녁', 3: '점심' };
export function pouchesFor(presetItems, state) {
  const rows = presetItems
    .map((it) => ({ it, p: state.products.find((x) => x.id === it.productId) }))
    .filter((r) => r.p);
  const rounds = Math.max(0, ...rows.map((r) => r.p.timesPerDay));
  const slotOf = (pid) => state.slots.find((s) => s.productId === pid)?.slot ?? null;
  return Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    items: rows
      .filter((r) => r.p.timesPerDay >= i + 1)
      .map((r) => ({ productId: r.p.id, slot: slotOf(r.p.id), count: r.it.count * r.p.servingCount })),
  }));
}

export function pouchLabel(memberTitle, round, isoDate) {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${memberTitle} · ${m}/${d} ${round}회차`;
}

/** 오늘 가족 전체 복용 진행: 모든 구성원의 회차 수(total), 먹은 회차(done), 다음 차례(구성원 순서대로 아직 안 나온 첫 회차) */
export function todaySummary(state, isoDate) {
  let total = 0, done = 0, next = null;
  for (const m of state.members) {
    const rounds = pouchesFor(state.presets?.[m.id] ?? [], state).map((p) => p.round);
    const taken = new Set(state.logs.filter((l) => l.date === isoDate && l.memberId === m.id && l.taken).map((l) => l.round));
    total += rounds.length;
    for (const r of rounds) {
      if (taken.has(r)) done++;
      else if (!next) next = { memberId: m.id, title: m.title, round: r };
    }
  }
  return { total, done, next };
}

/** 복용 알람 대상: preferId(앱에서 고른 구성원)에게 아직 안 먹은 회차가 있으면 그 사람, 없으면 오늘 첫 차례(todaySummary.next). 없으면 null
 *  { memberId, title, round, roundName, time, count(제품 종류 수) } */
export function nextAlarm(state, isoDate, preferId = null) {
  const pref = state.members.find((m) => m.id === preferId);
  const prefRound = pref && pouchesFor(state.presets?.[pref.id] ?? [], state).map((p) => p.round)
    .find((r) => !state.logs.some((l) => l.date === isoDate && l.memberId === pref.id && l.round === r && l.taken));
  const next = prefRound ? { memberId: pref.id, title: pref.title, round: prefRound } : todaySummary(state, isoDate).next;
  if (!next) return null;
  const pouch = pouchesFor(state.presets?.[next.memberId] ?? [], state).find((p) => p.round === next.round);
  return { memberId: next.memberId, title: next.title, round: next.round, roundName: ROUND_NAME[next.round] ?? `${next.round}회차`, time: ROUND_TIME[next.round] ?? '', count: pouch?.items.length ?? 0 };
}
