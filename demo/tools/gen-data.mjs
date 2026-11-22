// 가상 건강·복용 기록 데이터 생성기 (명세서 "기록·건강 데이터에 넣어야 할 패턴")
// 실행: node demo/tools/gen-data.mjs  → demo/data/health.json(워치 30일·인바디·워치 하루 중 기록), demo/data/logs.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// 결정적 의사난수 (실행할 때마다 같은 값)
let seed = 20261121;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const jitter = (base, spread) => Math.round((base + (rand() * 2 - 1) * spread) * 10) / 10;

const iso = (d) => d.toISOString().slice(0, 10);
const day = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// 최근 30일: 2026-10-22 ~ 2026-11-20 (시나리오 날짜 2026-11-21 전날까지)
const start = day('2026-10-22');
const days = Array.from({ length: 30 }, (_, i) => addDays(start, i));

const profiles = {
  mom:      { steps: 7200, sleepH: 6.6, outdoor: [40, 12], inbody: { w: 58.2, m: [21.4, 21.4, 21.5, 21.4], f: 29.1 } },
  dad:      { steps: 8400, sleepH: 6.2, outdoor: [35, 34], inbody: { w: 74.6, m: [30.2, 30.3, 30.2, 30.3], f: 24.8 } },
  son:      { steps: 9800, sleepH: 6.9, outdoor: [55, 50], inbody: { w: 71.0, m: [33.0, 32.8, 32.6, 32.4], f: 17.5 } },
  daughter: { steps: 8900, sleepH: 7.4, outdoor: [45, 44], inbody: { w: 52.3, m: [19.0, 19.1, 19.0, 19.1], f: 23.2 } },
};
const inbodyDates = ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20'];

const health = {};
for (const [id, p] of Object.entries(profiles)) {
  health[id] = {
    daily: days.map((d, i) => ({
      date: iso(d),
      steps: Math.round(jitter(p.steps, 1500)),
      sleepH: jitter(p.sleepH, 0.6),
      // 앞 16일 vs 최근 14일
      outdoorMin: Math.max(0, Math.round(jitter(i < 16 ? p.outdoor[0] : p.outdoor[1], 5))),
    })),
    inbody: inbodyDates.map((date, i) => ({
      date,
      weightKg: jitter(p.inbody.w, 0.3),
      muscleKg: p.inbody.m[i],
      fatPct: jitter(p.inbody.f, 0.3),
    })),
  };
}

// 복용 기록: 최근 4주 2026-10-24(토) ~ 2026-11-20(금)
const rounds = { mom: 1, dad: 1, son: 2, daughter: 1 };
const logDays = Array.from({ length: 28 }, (_, i) => addDays(day('2026-10-24'), i));
const isWeekend = (d) => [0, 6].includes(d.getUTCDay());
const sonWeekendMiss = new Set(['2026-10-24', '2026-10-31', '2026-11-01', '2026-11-08', '2026-11-15']); // 주말 8일 중 5일
const otherMiss = { mom: new Set(['2026-11-03']), dad: new Set(['2026-11-10', '2026-10-29']), daughter: new Set(['2026-11-05']), son: new Set(['2026-11-04']) };

const logs = [];
for (const d of logDays) {
  const date = iso(d);
  for (const memberId of Object.keys(rounds)) {
    for (let round = 1; round <= rounds[memberId]; round++) {
      let taken = true;
      if (memberId === 'son' && round === 1 && isWeekend(d) && sonWeekendMiss.has(date)) taken = false;
      if (otherMiss[memberId].has(date) && round === 1) taken = false;
      logs.push({ date, memberId, round, taken });
    }
  }
}

// 워치 하루 중 기록(외출 파우치 '패턴 알람'용): 11:00~15:00을 10분 칸 24개로, 칸마다 걸음 수와 평균 심박.
// 점심 식사 동안은 걸음이 거의 없고 심박이 평소보다 조금 오르게 만든 가상 패턴. 위 값들이 바뀌지 않게 난수를 따로 쓴다.
let seed2 = 20261122;
const rand2 = () => ((seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (a, b) => a + rand2() * (b - a);
const FROM = 11 * 60, BIN = 10, BINS = 24;
// 점심 시작(분)·식사 시간(분)·평소 심박. skip = 그날은 식사 구간이 안 잡힘(걸으며 먹음 등)
const lunch = {
  mom:      { start: 12 * 60 + 5,  dur: 40, hr: 74, skip: [3, 10] },
  dad:      { start: 12 * 60 + 15, dur: 35, hr: 70, skip: [6] },
  son:      { start: 12 * 60 + 35, dur: 30, hr: 72, skip: [2, 8, 12] },
  daughter: { start: 12 * 60 + 25, dur: 35, hr: 78, skip: [5] },
};
function midday(p, { skip = false, start, dur }) {
  const steps = [], hr = [];
  for (let i = 0; i < BINS; i++) {
    const t = FROM + i * BIN;
    const eating = !skip && t >= start && t < start + dur;
    const after = !skip && t >= start + dur && t < start + dur + 20; // 식사 뒤 잠깐 걸음
    steps.push(Math.round(eating ? between(0, 60) : after ? between(500, 900) : between(220, 700)));
    hr.push(Math.round(p.hr + (eating ? between(8, 13) : between(-3, 3))));
  }
  return { steps, hr };
}
for (const [id, p] of Object.entries(lunch)) {
  const recent = days.slice(-14); // 최근 14일 (11-07 ~ 11-20)
  health[id].intraday = {
    from: '11:00', binMin: BIN,
    days: recent.map((d, i) => {
      const start = p.start + Math.round(between(-15, 15) / 5) * 5;
      const dur = p.dur + Math.round(between(-10, 10) / 5) * 5;
      return { date: iso(d), ...midday(p, { skip: p.skip.includes(i), start, dur }) };
    }),
    today: { date: '2026-11-21', ...midday(p, { start: p.start + 5, dur: p.dur }) }, // 시연 '오늘 워치 기록 재생'
  };
}

// 숫자 배열(워치 10분 칸)은 한 줄로: 파일이 수천 줄로 늘지 않게
const oneLineNums = (json) => json.replace(/\[\s*(-?\d[\d.,\s-]*?)\s*\]/g, (_, inner) => `[${inner.split(/\s*,\s*/).join(',')}]`);
writeFileSync(join(dataDir, 'health.json'), oneLineNums(JSON.stringify(health, null, 1)) + '\n');
writeFileSync(join(dataDir, 'logs.json'), JSON.stringify(logs, null, 1) + '\n');
console.log(`health.json (${days.length}일 × 4명), logs.json (${logs.length}건) 생성`);
