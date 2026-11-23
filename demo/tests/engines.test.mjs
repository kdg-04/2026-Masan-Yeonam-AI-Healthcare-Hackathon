import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pouchesFor, pouchLabel } from '../js/engine/schedule.js';
import { assignSlot, slotMessage, remainingDays, usersOf } from '../js/engine/slots.js';
import { adherence, weekendMissed, insightLines } from '../js/engine/insight.js';
import { guideCards } from '../js/engine/guide.js';
import { fmt } from '../js/engine/text.js';
import { demoState } from './helpers.mjs';

test('schedule: 아들은 2봉지, 1회차 P06·P07 / 2회차 P07, 칸 번호 포함', () => {
  const s = demoState();
  assert.deepEqual(pouchesFor(s.presets.son, s), [
    { round: 1, items: [{ productId: 'P06', slot: 7, count: 1 }, { productId: 'P07', slot: 8, count: 1 }] },
    { round: 2, items: [{ productId: 'P07', slot: 8, count: 1 }] },
  ]);
  assert.equal(pouchesFor(s.presets.dad, s).length, 1);
  assert.deepEqual(pouchesFor([], s), []);
});

test('schedule: 파우치 라벨 "아빠 · 11/21 1회차"', () => {
  assert.equal(pouchLabel('아빠', 1, '2026-11-21'), '아빠 · 11/21 1회차');
});

test('slots: 빈 칸 중 번호가 가장 작은 5번 (서늘 구역 없음)', () => {
  const s = demoState();
  const a = assignSlot(s.probiotics, s.slots);
  assert.deepEqual(a, { slot: 5 });
  assert.equal(slotMessage(s.probiotics, a, s.copy), '데일리 유산균(가상)은 5번 칸에 넣을게요. 칸 안 습도는 기기가 관리해요.');
});

test('slots: 5·6번이 차 있으면 다음 빈 칸 10번', () => {
  const s = demoState();
  const full = s.slots.map((x) => ([5, 6].includes(x.slot) ? { ...x, productId: 'X' } : x));
  const a = assignSlot(s.probiotics, full);
  assert.deepEqual(a, { slot: 10 });
  assert.equal(slotMessage(s.probiotics, a, s.copy), '데일리 유산균(가상)은 10번 칸에 넣을게요. 칸 안 습도는 기기가 관리해요.');
});

test('slots: 빈 칸이 없으면 null', () => {
  const s = demoState();
  assert.equal(assignSlot(s.probiotics, s.slots.map((x) => ({ ...x, productId: 'X' }))), null);
});

test('slots: 남은 일수 = 잔량 ÷ 하루 사용량 (오메가3 9일, 비타민B 30일, 안 쓰면 null)', () => {
  const s = demoState();
  assert.equal(remainingDays('P04', s), 9);
  assert.equal(remainingDays('P07', s), 30);
  s.presets = { ...s.presets, dad: [] };
  assert.equal(remainingDays('P05', s), null);
});

test('insight: 아들 주말 1회차 8번 중 5번 놓침, 복용률 계산', () => {
  const s = demoState();
  assert.deepEqual(weekendMissed('son', 1, s.logs), { total: 8, missed: 5 });
  assert.ok(adherence('mom', s.logs) >= 90);
  const lines = insightLines(s);
  assert.ok(lines.includes('아들 님은 최근 4주 동안 주말 1회차를 8번 중 5번 놓쳤어요.'));
  assert.ok(lines.includes('엄마 오메가3 1000(가상)은 9일 뒤 떨어져요.'));
});

test('guide: 엄마는 실외 활동 감소 → 비타민D 카드(지금 60µg, 60%), 아들은 골격근량 4주 감소 카드', () => {
  const s = demoState();
  const mom = guideCards('mom', s);
  assert.equal(mom.length, 1);
  assert.equal(mom[0].id, 'G01');
  assert.match(mom[0].message, /지금 2개 제품에서 하루 60µg 드시고 있어요\(상한 100µg의 60%\)/);
  assert.doesNotMatch(mom[0].message, /더 필요한지/);
  const son = guideCards('son', s);
  assert.equal(son[0].id, 'G02');
  assert.match(son[0].message, /33kg에서 32.4kg으로/);
  assert.deepEqual(guideCards('dad', s), []);
});

test('text: 조사 처리 (받침·괄호·영문·숫자)', () => {
  assert.equal(fmt('{a:이/가}', { a: '비타민D' }), '비타민D가');
  assert.equal(fmt('{a:와/과}', { a: '항응고제(가상)' }), '항응고제(가상)와');
  assert.equal(fmt('{a:은/는}', { a: '데일리 유산균(가상)' }), '데일리 유산균(가상)은');
  assert.equal(fmt('{a:을/를}', { a: 'EPA·DHA' }), 'EPA·DHA를');
  assert.equal(fmt('{missing}', {}), '{missing}');
});

import { todaySummary } from '../js/engine/schedule.js';

test('today: 가족 전체 오늘 회차 수와 다음 차례 (아무도 안 먹었을 때 엄마 1회차)', () => {
  const s = demoState();
  s.logs = [];
  const total = s.members.reduce((n, m) => n + pouchesFor(s.presets[m.id] ?? [], s).length, 0);
  const t = todaySummary(s, '2026-11-21');
  assert.equal(t.total, total);
  assert.equal(t.done, 0);
  assert.deepEqual(t.next, { memberId: 'mom', title: '엄마', round: 1 });
});

test('today: 먹은 회차는 done에 세고, 다음 차례는 아직 안 나온 첫 회차', () => {
  const s = demoState();
  s.logs = [
    { date: '2026-11-21', memberId: 'mom', round: 1, taken: true },
    { date: '2026-11-20', memberId: 'dad', round: 1, taken: true }, // 다른 날은 세지 않음
  ];
  const momRounds = pouchesFor(s.presets.mom, s).length;
  const t = todaySummary(s, '2026-11-21');
  assert.equal(t.done, 1);
  assert.deepEqual(t.next, momRounds > 1 ? { memberId: 'mom', title: '엄마', round: 2 } : { memberId: 'dad', title: '아빠', round: 1 });
});

test('today: 모두 먹었으면 next는 null', () => {
  const s = demoState();
  s.logs = s.members.flatMap((m) => pouchesFor(s.presets[m.id] ?? [], s).map((p) => ({ date: '2026-11-21', memberId: m.id, round: p.round, taken: true })));
  const t = todaySummary(s, '2026-11-21');
  assert.equal(t.done, t.total);
  assert.equal(t.next, null);
});

test('usersOf: 가족 초대 전(엄마 한 명)이면 아직 안 들어온 사람은 빼고 돌려준다 (영양제 탭 멈춤 방지)', () => {
  const s = demoState();
  assert.deepEqual(usersOf('P05', s), ['dad']); // 4명 다 있으면 아빠
  const momOnly = { ...s, members: s.members.filter((m) => m.id === 'mom') };
  assert.deepEqual(usersOf('P05', momOnly), []); // 아빠가 아직 안 들어왔으면 빈 목록
  assert.deepEqual(usersOf('P01', momOnly), ['mom']);
});

import { nextAlarm } from '../js/engine/schedule.js';

test('alarm: 복용 알람은 오늘 아직 안 먹은 첫 차례에게 (시간·종류 수 포함), 모두 먹었으면 null', () => {
  const s = demoState();
  s.logs = [];
  const momFirst = pouchesFor(s.presets.mom, s)[0];
  assert.deepEqual(nextAlarm(s, '2026-11-21'), { memberId: 'mom', title: '엄마', round: 1, roundName: '아침', time: '오전 8:00', count: momFirst.items.length });
  assert.equal(nextAlarm(s, '2026-11-21', 'dad').memberId, 'dad'); // 앱에서 아빠를 골랐으면 아빠에게
  s.logs = pouchesFor(s.presets.dad, s).map((p) => ({ date: '2026-11-21', memberId: 'dad', round: p.round, taken: true }));
  assert.equal(nextAlarm(s, '2026-11-21', 'dad').memberId, 'mom'); // 아빠가 다 먹었으면 오늘 첫 차례
  s.logs = s.members.flatMap((m) => pouchesFor(s.presets[m.id] ?? [], s).map((p) => ({ date: '2026-11-21', memberId: m.id, round: p.round, taken: true })));
  assert.equal(nextAlarm(s, '2026-11-21'), null);
});
