// 실행: node --test demo/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMember, memberTotals } from '../js/engine/safety.js';
import { demoState } from './helpers.mjs';

const items = (...ids) => ids.map((productId) => ({ productId, count: 1 }));
const summary = (ws) => ws.map((w) => `${w.type}:${w.level}:${w.key ?? ''}`);

test('T1 엄마 조합: 아연 caution 96%, 아연·비타민D 중복 info, 비타민D 60%', () => {
  const s = demoState();
  const ws = checkMember('mom', s.presets.mom, s);
  assert.deepEqual(summary(ws), ['upper:caution:zinc', 'duplicate:info:vitD', 'duplicate:info:zinc']);
  const zinc = ws.find((w) => w.type === 'upper');
  assert.equal(zinc.evidence.value, 33.5);
  assert.equal(zinc.evidence.limit, 35);
  assert.equal(zinc.pct, 96);
  assert.equal(zinc.message, '아연 하루 합계가 33.5mg으로 상한(35mg)의 96%예요. 제품 표시사항을 확인하고, 필요하면 의사·약사와 상담하세요.');
  const bars = memberTotals('mom', s.presets.mom, s);
  assert.equal(bars.find((b) => b.key === 'vitD').pct, 60);
  assert.equal(ws.find((w) => w.key === 'vitD').message, '비타민D가 2개 제품에 들어 있어요. 하루 합계 60µg, 상한의 60%예요.');
});

test('T2 딸 조합 + 유산균: 알레르기 danger "우유" 1개', () => {
  const s = demoState();
  s.products = [...s.products, s.probiotics];
  const ws = checkMember('daughter', [...s.presets.daughter, { productId: 'P09', count: 1 }], s);
  assert.deepEqual(summary(ws), ['allergy:danger:P09']);
  assert.equal(ws[0].message, "이 제품에는 '우유' 함유 표시가 있어요. 딸 님 알레르기 정보와 겹쳐요. 표시사항을 다시 확인하고, 걱정되면 의사·약사와 상담하세요.");
  assert.equal(ws[0].evidence.labelText, 'Contains: Milk / Store in a cool, dry place / For adults.');
});

test('T3 아빠 조합 + 오메가3: drug danger (항응고제 × EPA·DHA) 1개', () => {
  const s = demoState();
  s.meds = [{ ...s.ocr['med-anticoagulant.svg'], memberId: 'dad' }]; // 시연처럼 약봉투로 등록한 약
  const ws = checkMember('dad', [...s.presets.dad, { productId: 'P04', count: 1 }], s);
  assert.deepEqual(summary(ws), ['drug:danger:epa_dha']);
  assert.equal(ws[0].evidence.source, '식약처 정보그림 뉴스');
  assert.match(ws[0].message, /혈전예방정\(가상\)과 오메가3 1000\(가상\)을 함께 드시면 출혈 위험 때문에 주의가 필요해요/);
  assert.doesNotMatch(ws[0].message, /EPA·DHA/); // 성분 이름이 아니라 제품 이름으로
});

test('T4 아들 조합: 경고 0개, 마그네슘 71%, 비타민B6 40% (2025 상한 50mg)', () => {
  const s = demoState();
  assert.deepEqual(checkMember('son', s.presets.son, s), []);
  const bars = memberTotals('son', s.presets.son, s);
  assert.equal(bars.find((b) => b.key === 'magnesium').pct, 71);
  assert.equal(bars.find((b) => b.key === 'vitB6').pct, 40);
  assert.equal(bars.find((b) => b.key === 'vitB6').total, 20); // 10mg × 1정 × 1일 2회
});

test('19세 미만은 상한 기준값 없음: 경고 없이 막대 pct null', () => {
  const s = demoState();
  const heavy = [{ productId: 'P03', count: 2 }]; // 아연 50mg
  assert.deepEqual(checkMember('daughter', heavy, s), []);
  const bar = memberTotals('daughter', heavy, s).find((b) => b.key === 'zinc');
  assert.equal(bar.pct, null);
  assert.equal(bar.limitLabel, '기준값 없음');
});

test('100% 이상은 danger "상한을 넘어요"', () => {
  const s = demoState();
  const ws = checkMember('mom', [{ productId: 'P02', count: 2 }, { productId: 'P01', count: 1 }], s); // vitD 110µg
  const up = ws.find((w) => w.type === 'upper');
  assert.equal(up.level, 'danger');
  assert.equal(up.title, '비타민D 상한을 넘어요');
});

test('표시 순서 danger → caution → info', () => {
  const s = demoState();
  s.products = [...s.products, s.probiotics];
  const ws = checkMember('daughter', [{ productId: 'P01', count: 1 }, { productId: 'P08', count: 1 }, { productId: 'P09', count: 1 }], s);
  const order = { danger: 0, caution: 1, info: 2 };
  assert.deepEqual(ws.map((w) => order[w.level]), [...ws.map((w) => order[w.level])].sort());
  assert.equal(ws[0].level, 'danger');
});

test('섭취 대상 확인은 옵션(Could): ageCheck 켜면 성인용 제품 × 16세 info', () => {
  const s = demoState();
  s.products = [...s.products, s.probiotics];
  const ws = checkMember('daughter', items('P09'), s, { ageCheck: true });
  assert.ok(ws.some((w) => w.type === 'age' && w.level === 'info'));
});

test('모르는 제품 id나 빈 조합은 경고 없이 넘어감', () => {
  const s = demoState();
  assert.deepEqual(checkMember('mom', [], s), []);
  assert.deepEqual(checkMember('mom', items('NOPE'), s), []);
});
