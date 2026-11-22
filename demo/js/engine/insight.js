// 기록 요약: 숫자는 항상 계산 결과, 문장은 copy.json 틀
import { fmt } from './text.js';
import { remainingDays, usersOf } from './slots.js';

const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

export function adherence(memberId, logs) {
  const mine = logs.filter((l) => l.memberId === memberId);
  if (!mine.length) return null;
  return Math.round((mine.filter((l) => l.taken).length / mine.length) * 100);
}

export function weekendMissed(memberId, round, logs) {
  const rows = logs.filter((l) => l.memberId === memberId && l.round === round && isWeekend(l.date));
  return { total: rows.length, missed: rows.filter((l) => !l.taken).length };
}

/** 화면에 보여 줄 요약 문장들 */
export function insightLines(state, { runOutWithinDays = 14 } = {}) {
  const lines = [];
  for (const m of state.members) {
    const w = weekendMissed(m.id, 1, state.logs);
    if (w.total && w.missed >= 3) lines.push(fmt(state.copy.insightMissed, { member: m.title, round: 1, ...w }));
  }
  for (const s of state.slots) {
    if (!s.productId) continue;
    const days = remainingDays(s.productId, state);
    if (days === null || days > runOutWithinDays) continue;
    const p = state.products.find((x) => x.id === s.productId);
    const users = usersOf(s.productId, state).map((id) => state.members.find((m) => m.id === id)?.title);
    lines.push(fmt(state.copy.runOut, { member: users.length === 1 ? users[0] : '가족', product: p.name, days }));
  }
  return lines;
}
