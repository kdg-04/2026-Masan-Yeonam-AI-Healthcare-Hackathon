import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createStore } from '../js/store.js';
import { RELAY_EVENTS, makeEnvelope, acceptEnvelope, roomFromSearch, connectRelay, createLocalTransport } from '../js/relay.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('bus: on/emit/off, onAny는 meta까지 받음', () => {
  const bus = createBus();
  const got = [];
  const off = bus.on('a', (p) => got.push(p));
  bus.onAny((name, p, meta) => got.push([name, meta.remote ?? false]));
  bus.emit('a', 1);
  off();
  bus.emit('a', 2, { remote: true });
  assert.deepEqual(got, [1, ['a', false], ['a', true]]);
});

test('store: set(path)·subscribe·reset', () => {
  const store = createStore({ slots: [{ slot: 1, remaining: 5 }], ui: { member: 'mom' } });
  let calls = 0;
  store.subscribe(() => calls++);
  store.set('ui.member', 'dad');
  assert.equal(store.state.ui.member, 'dad');
  store.update((s) => { s.slots[0].remaining -= 1; });
  assert.equal(store.state.slots[0].remaining, 4);
  store.reset({ ui: { member: 'mom' } });
  assert.equal(store.state.ui.member, 'mom');
  assert.equal(calls, 3);
});

test('envelope: 상대 역할이 보낸 정해진 이벤트만, 한 번만 받음', () => {
  const seen = new Set();
  const env = makeEnvelope('app', 'device:dispense', { memberId: 'dad' });
  assert.equal(acceptEnvelope(env, 'device', seen), true);
  assert.equal(acceptEnvelope(env, 'device', seen), false, '중복 id');
  assert.equal(acceptEnvelope(makeEnvelope('app', 'device:dispense', {}), 'app', new Set()), false, '내가 보낸 역할');
  assert.equal(acceptEnvelope(makeEnvelope('app', 'product:registered', {}), 'device', new Set()), false, '중계 안 하는 이벤트');
  assert.equal(acceptEnvelope(makeEnvelope('device', 'device:dispense', {}), 'app', new Set()), false, '방향이 틀림');
  assert.equal(acceptEnvelope({ v: 2, id: 'x', from: 'app', name: 'device:load' }, 'device', new Set()), false, '버전');
  assert.equal(acceptEnvelope(null, 'device', new Set()), false);
  assert.ok(RELAY_EVENTS.app.includes('state:sync') && RELAY_EVENTS.device.includes('device:hello'));
});

test('roomFromSearch: 소문자·숫자·하이픈만, 없으면 demo', () => {
  assert.equal(roomFromSearch(''), 'demo');
  assert.equal(roomFromSearch('?room=Team-7'), 'team-7');
  assert.equal(roomFromSearch('?room=<script>'), 'demo');
});

test('relay(BroadcastChannel): 앱 → 기기, 기기 → 앱으로 옮기고 되돌려 보내지 않음', async () => {
  const room = `t-${Date.now()}`;
  const appBus = createBus();
  const devBus = createBus();
  const app = connectRelay({ bus: appBus, role: 'app', room, transports: [createLocalTransport(room)], heartbeatMs: 0 });
  const dev = connectRelay({ bus: devBus, role: 'device', room, transports: [createLocalTransport(room)], heartbeatMs: 0 });
  const devGot = [];
  const appGot = [];
  devBus.on('device:dispense', (p) => devGot.push(p));
  appBus.on('device:dispensed', (p) => appGot.push(p));
  appBus.on('device:dispense', (p, meta) => { if (meta.remote) appGot.push('echo!'); });

  appBus.emit('device:dispense', { memberId: 'dad', round: 1, items: [{ slot: 3, count: 1 }], label: '아빠 · 11/21 1회차' });
  appBus.emit('product:registered', { product: {} }); // 중계 안 함
  await tick();
  devBus.emit('device:dispensed', { memberId: 'dad', round: 1, at: 1 });
  await tick();

  assert.deepEqual(devGot, [{ memberId: 'dad', round: 1, items: [{ slot: 3, count: 1 }], label: '아빠 · 11/21 1회차' }]);
  assert.deepEqual(appGot, [{ memberId: 'dad', round: 1, at: 1 }]);
  assert.equal(app.peerStatus(), 'local');
  app.close();
  dev.close();
});

test('relay: 다른 방은 섞이지 않음', async () => {
  const a = createBus();
  const b = createBus();
  const r1 = connectRelay({ bus: a, role: 'app', room: 'room-a', transports: [createLocalTransport('room-a')], heartbeatMs: 0 });
  const r2 = connectRelay({ bus: b, role: 'device', room: 'room-b', transports: [createLocalTransport('room-b')], heartbeatMs: 0 });
  let got = 0;
  b.on('device:load', () => got++);
  a.emit('device:load', { productId: 'P09', slot: 5 });
  await tick();
  assert.equal(got, 0);
  assert.equal(r1.peerStatus(), 'none');
  r1.close();
  r2.close();
});

test('mirror: 미러링 앱은 폰 앱이 보낸 화면 상태·알림만 받는다', () => {
  assert.equal(acceptEnvelope(makeEnvelope('app', 'mirror:state', {}), 'mirror', new Set()), true);
  assert.equal(acceptEnvelope(makeEnvelope('app', 'mirror:toast', {}), 'mirror', new Set()), true);
  assert.equal(acceptEnvelope(makeEnvelope('app', 'device:dispense', {}), 'mirror', new Set()), false, '기기 명령은 미러가 안 받음');
  assert.equal(acceptEnvelope(makeEnvelope('device', 'device:hello', {}), 'mirror', new Set()), false, '기기 신호도 안 받음');
  assert.ok(RELAY_EVENTS.app.includes('mirror:state'));
  assert.deepEqual(RELAY_EVENTS.mirror, [], '미러는 아무것도 보내지 않음');
});

test('mirror: 기기는 미러용 메시지를 무시하고, 앱은 미러 메시지를 받지 않는다', () => {
  assert.equal(acceptEnvelope(makeEnvelope('app', 'mirror:state', {}), 'device', new Set()), false);
  assert.equal(acceptEnvelope(makeEnvelope('app', 'mirror:state', {}), 'app', new Set()), false);
  assert.equal(acceptEnvelope(makeEnvelope('app', 'device:dispense', {}), 'device', new Set()), true, '기존 기기 명령은 그대로');
});
