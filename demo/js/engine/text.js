// 문구 틀 채우기: "{name}" → 값, "{name:이/가}" → 값 + 받침에 맞는 조사
const DIGIT_HAS_FINAL = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };

function hasFinalConsonant(word) {
  const base = String(word).replace(/\s*\([^)]*\)\s*$/, '').trim(); // "유산균(가상)" → "유산균"
  const ch = base.at(-1) ?? '';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/\d/.test(ch)) return DIGIT_HAS_FINAL[ch];
  return false; // 영문 등은 받침 없음으로 (비타민D가, DHA를)
}

// 받침 있을 때 / 없을 때 (틀에 어느 순서로 쓰든 같은 결과)
const JOSA = { '이/가': ['이', '가'], '은/는': ['은', '는'], '을/를': ['을', '를'], '와/과': ['과', '와'], '과/와': ['과', '와'] };

export function withJosa(word, pair) {
  const [withFinal, withoutFinal] = JOSA[pair] ?? pair.split('/');
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

export function fmt(template, vars = {}) {
  return String(template ?? '').replace(/\{(\w+)(?::([^}]+))?\}/g, (whole, key, josa) => {
    if (!(key in vars)) return whole;
    return josa ? withJosa(vars[key], josa) : String(vars[key]);
  });
}

export const round1 = (n) => Math.round(n * 10) / 10;
