import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceQueue } from '../js/device/queue.js';

const later = (ms, fn) => () => new Promise((r) => setTimeout(() => { fn(); r(); }, ms));

test('동작은 들어온 순서대로 하나씩 실행', async () => {
  const log = [];
  const q = createDeviceQueue({ applySync: () => {} });
  q.run(later(30, () => log.push('a')));
  q.run(later(5, () => log.push('b')));
  await q.idle();
  assert.deepEqual(log, ['a', 'b']);
});

test('동작 중 받은 state:sync는 마지막 값만, 동작이 끝난 뒤 반영', async () => {
  const applied = [];
  const q = createDeviceQueue({ applySync: (s) => applied.push(s) });
  q.run(later(30, () => {}));
  q.sync({ n: 1 });
  q.sync({ n: 2 });
  assert.deepEqual(applied, []);
  await q.idle();
  assert.deepEqual(applied, [{ n: 2 }]);
});

test('쉬고 있을 때 state:sync는 바로 반영', () => {
  const applied = [];
  const q = createDeviceQueue({ applySync: (s) => applied.push(s) });
  q.sync({ n: 1 });
  assert.deepEqual(applied, [{ n: 1 }]);
});

test('동작 하나가 실패해도 다음 동작은 계속', async () => {
  const log = [];
  const q = createDeviceQueue({ applySync: () => {}, onError: () => log.push('err') });
  q.run(() => Promise.reject(new Error('x')));
  q.run(later(1, () => log.push('ok')));
  await q.idle();
  assert.deepEqual(log, ['err', 'ok']);
});
