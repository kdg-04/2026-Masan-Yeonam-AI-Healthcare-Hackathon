import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealWindow, mealPattern, firstMealEnd } from '../js/engine/pattern.js';
import { demoState } from './helpers.mjs';

// 11:00부터 10분 칸 24개. 12:10~12:50(4칸) 걸음 적고 심박 +10
const day = (quiet = [8, 9, 10, 11], rise = 10) => ({
  date: 'x',
  steps: Array.from({ length: 24 }, (_, i) => (quiet.includes(i) ? 20 : 400)),
  hr: Array.from({ length: 24 }, (_, i) => (quiet.includes(i) ? 72 + rise : 72)),
});

test('pattern: 걸음이 적고 심박이 오른 30분 이상 구간을 점심 식사로 추정 (끝 = 구간 다음 칸 시각)', () => {
  assert.deepEqual(mealWindow(day()), { start: '12:20', end: '13:00', minutes: 40 });
});

test('pattern: 20분뿐이거나 심박이 안 오르면 식사 구간 아님', () => {
  assert.equal(mealWindow(day([8, 9])), null);
  assert.equal(mealWindow(day(undefined, 2)), null);
});

test('pattern: 오늘 재생 — 구간이 아직 이어지는 중이면 끝을 모름, 걸음이 다시 늘어난 칸에서 처음 잡힘', () => {
  const d = day();
  assert.equal(mealWindow(d, { bins: 11 }), null); // 12:40 칸까지 봤을 때: 아직 식사 중
  assert.deepEqual(firstMealEnd(d), { bin: 12, window: { start: '12:20', end: '13:00', minutes: 40 } });
});

test('pattern: 가상 워치 14일(health.json intraday)로 사람마다 평소 식사 끝 시각과 범위', () => {
  const s = demoState();
  for (const id of ['mom', 'dad', 'son', 'daughter']) {
    const p = mealPattern(s.health[id].intraday.days);
    assert.equal(p.ok, true, id);
    assert.ok(p.detected >= 10 && p.detected <= 14, `${id} ${p.detected}`);
    assert.ok(p.low <= p.usual && p.usual <= p.high, id);
    assert.ok(p.usual >= '12:30' && p.usual <= '13:20', `${id} ${p.usual}`);
  }
  assert.ok(firstMealEnd(s.health.mom.intraday.today)); // 오늘 기록 재생하면 식사 끝이 잡힘
});

test('pattern: 5일 미만으로 잡히면 패턴 없음(ok=false)', () => {
  const p = mealPattern([day(), day(), day([1]), day([1]), day([1]), day([1])]);
  assert.equal(p.ok, false);
  assert.equal(p.detected, 2);
});
