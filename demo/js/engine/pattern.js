// 외출 파우치 'AI 맞춤 알람'(화면 이름, 사용자 결정 11-21): 워치 기록(걸음 수·심박)으로 점심 식사가 끝나는 때를 추정한다.
// 데모는 정해 둔 규칙 + 통계(중앙값·사분위)로 계산하고, 화면 각주에 그렇게 밝힌다(실서비스 계획: 개인별 학습 모델).
// 진단이 아니라 알림 시점을 고르는 데만 쓴다.

export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const median = (arr) => quantile([...arr].sort((a, b) => a - b), 0.5);

export const RULE = { quietSteps: 150, hrRise: 5, minBins: 3, earliest: '11:30', latest: '14:30' };

/**
 * 하루 기록에서 점심 식사 구간 추정.
 * 기준 심박 = 처음 3칸(11:00~11:30)의 중앙값. 11:30~14:30 사이에서 걸음 < 150(10분)이고 심박이 기준보다 5 이상 높은 칸이
 * 3칸(30분) 이상 이어진 가장 긴 구간. 없으면 null. bins로 앞쪽 일부만 넘기면 그때까지 기록으로만 판단(오늘 재생용)
 */
export function mealWindow(day, { from = '11:00', binMin = 10, bins = day.steps.length } = {}) {
  const base = median(day.hr.slice(0, 3));
  const f = toMin(from), lo = toMin(RULE.earliest), hi = toMin(RULE.latest);
  let best = null, runStart = null;
  const close = (endIdx) => {
    if (runStart === null) return;
    const len = endIdx - runStart;
    if (len >= RULE.minBins && (!best || len > best.len)) best = { len, s: runStart, e: endIdx };
    runStart = null;
  };
  for (let i = 0; i < bins; i++) {
    const t = f + i * binMin;
    const meal = t >= lo && t < hi && day.steps[i] < RULE.quietSteps && day.hr[i] >= base + RULE.hrRise;
    if (meal && runStart === null) runStart = i;
    if (!meal) close(i);
  }
  // 아직 끝나지 않은 구간(마지막 칸까지 이어짐)은 '끝'을 모르므로 넣지 않는다
  if (!best) return null;
  return { start: toHHMM(f + best.s * binMin), end: toHHMM(f + best.e * binMin), minutes: best.len * binMin };
}

/** 지난 기록(여러 날)으로 평소 식사 끝 시각: 중앙값과 사분위 범위. 5일 미만으로 잡히면 ok=false */
export function mealPattern(days, opts = {}) {
  const perDay = days.map((d) => ({ date: d.date, window: mealWindow(d, opts) }));
  const ends = perDay.filter((x) => x.window).map((x) => toMin(x.window.end)).sort((a, b) => a - b);
  const result = { days: days.length, detected: ends.length, perDay: perDay.map((x) => ({ date: x.date, end: x.window?.end ?? null })) };
  if (ends.length < 5) return { ok: false, ...result };
  const round5 = (m) => Math.round(m / 5) * 5;
  return { ok: true, ...result, usual: toHHMM(round5(quantile(ends, 0.5))), low: toHHMM(round5(quantile(ends, 0.25))), high: toHHMM(round5(quantile(ends, 0.75))) };
}

/** 오늘 기록을 칸 단위로 받아 볼 때, 식사 구간이 끝났다고 처음 판단되는 칸 번호와 구간. 끝까지 없으면 null */
export function firstMealEnd(today, opts = {}) {
  for (let n = 1; n <= today.steps.length; n++) {
    const w = mealWindow(today, { ...opts, bins: n });
    if (w) return { bin: n - 1, window: w };
  }
  return null;
}
