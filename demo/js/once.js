// 같은 요청이 여러 번 와도 한 번만 처리하기 위한 id 기억 장치.
// 앱 창이 여러 개 열려 있으면 기기 버튼 한 번에 배출 명령이 여러 개 오므로, 누른 번호(id)로 걸러 낸다.
export function createOnce(limit = 200) {
  const seen = new Set();
  return (id) => {
    if (id == null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > limit) seen.delete(seen.values().next().value);
    return true;
  };
}

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// 기기는 한 앱의 상태(state:sync)만 따른다. 같은 방에 앱 창이 여러 개면 5초마다 서로 다른 상태가 와서
// 기기 화면이 번갈아 바뀌므로(깜빡임), 붙은 앱을 따르다가 그 앱이 timeoutMs 동안 조용하면 다음 앱으로 넘어간다.
// 사람이 어떤 앱에서 조작하면(초기화·배출·가족 초대 등) accept.claim(appId)로 그 앱으로 바로 넘어간다.
// (따르던 앱이 5초마다 답하면 잠금이 안 풀려, 다른 창에서 [시나리오 초기화]를 눌러도 기기가 안 바뀌던 문제)
export function createSourceLock(timeoutMs = 12000) {
  let source = null, lastAt = -Infinity;
  const accept = (appId, now = Date.now()) => {
    if (appId == null) return true;
    if (source !== null && appId !== source && now - lastAt <= timeoutMs) return false;
    source = appId; lastAt = now;
    return true;
  };
  accept.claim = (appId, now = Date.now()) => { if (appId != null) { source = appId; lastAt = now; } };
  return accept;
}
