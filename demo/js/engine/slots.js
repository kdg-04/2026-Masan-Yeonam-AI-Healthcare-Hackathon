import { fmt } from './text.js';

/** 빈 칸 중 번호가 가장 작은 칸. 빈 칸이 없으면 null.
 *  (11-21 결정: 서늘 구역 없음. 기기는 12칸 모두 같은 조건이고 칸 안 습도만 관리한다) */
export function assignSlot(product, slots) {
  const empty = slots.filter((s) => !s.productId).sort((a, b) => a.slot - b.slot);
  return empty[0] ? { slot: empty[0].slot } : null;
}

export function slotMessage(product, a, copy) {
  return fmt(copy.slotAssigned, { name: product.name, slot: a.slot });
}

/** 하루 사용량 = 모든 구성원 조합의 count × timesPerDay 합 */
export function dailyUse(productId, state) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return 0;
  return Object.values(state.presets).flat()
    .filter((it) => it.productId === productId)
    .reduce((sum, it) => sum + it.count * p.servingCount * p.timesPerDay, 0);
}

export function remainingDays(productId, state) {
  const use = dailyUse(productId, state);
  const slot = state.slots.find((s) => s.productId === productId);
  if (!use || !slot) return null;
  return Math.floor(slot.remaining / use);
}

/** 이 제품을 조합에 넣은 구성원 id. 가족 초대 데모에서 아직 들어오지 않은 사람(state.members에 없음)은 빼고 돌려준다 */
export function usersOf(productId, state) {
  const joined = new Set((state.members ?? []).map((m) => m.id));
  return Object.entries(state.presets)
    .filter(([memberId, items]) => joined.has(memberId) && items.some((it) => it.productId === productId))
    .map(([memberId]) => memberId);
}
