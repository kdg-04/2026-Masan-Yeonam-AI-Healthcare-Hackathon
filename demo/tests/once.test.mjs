import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOnce } from '../js/once.js';

test('같은 요청 id는 한 번만 통과한다 (앱 창이 여러 개여도 버튼 한 번 = 배출 한 번)', () => {
  const first = createOnce();
  assert.equal(first('press-1'), true);
  assert.equal(first('press-1'), false);
  assert.equal(first('press-1'), false);
  assert.equal(first('press-2'), true);
});

test('id가 없는 옛 요청은 막지 않는다', () => {
  const first = createOnce();
  assert.equal(first(undefined), true);
  assert.equal(first(undefined), true);
});

test('오래된 id는 한도를 넘으면 잊는다', () => {
  const first = createOnce(2);
  first('a'); first('b'); first('c');
  assert.equal(first('a'), true);
  assert.equal(first('c'), false);
});

import { createSourceLock } from '../js/once.js';

test('기기는 처음 붙은 앱의 상태만 따른다 (앱 창이 여러 개여도 화면이 번갈아 바뀌지 않게)', () => {
  const accept = createSourceLock(12000);
  assert.equal(accept('appA', 0), true);
  assert.equal(accept('appB', 1000), false);
  assert.equal(accept('appA', 5000), true);
  assert.equal(accept('appB', 9000), false);
});

test('따르던 앱이 12초 넘게 조용하면 다른 앱으로 넘어간다', () => {
  const accept = createSourceLock(12000);
  accept('appA', 0);
  assert.equal(accept('appB', 12001), true);
  assert.equal(accept('appA', 13000), false);
});

test('appId가 없는 옛 앱 상태는 막지 않는다', () => {
  const accept = createSourceLock(12000);
  assert.equal(accept(undefined, 0), true);
});

test('사람이 다른 앱에서 조작하면(claim) 기기는 바로 그 앱을 따른다 (따르던 앱이 계속 답해도)', () => {
  const accept = createSourceLock(12000);
  accept('appA', 0);
  assert.equal(accept('appB', 1000), false); // 그냥 답만 하면 막힘
  accept.claim('appB', 2000);                 // appB에서 [시나리오 초기화]
  assert.equal(accept('appB', 2001), true);
  assert.equal(accept('appA', 5000), false);  // 예전 앱의 5초 답은 이제 막힘
  accept.claim(undefined, 6000);              // appId 없으면 그대로
  assert.equal(accept('appB', 7000), true);
});
