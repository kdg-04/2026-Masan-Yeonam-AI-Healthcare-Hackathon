// 기기 동작 큐: device:* 요청을 순서대로 하나씩. 동작 중 받은 state:sync는 마지막 값만 들고 있다가 끝난 뒤 반영 (README 2-3)
export function createDeviceQueue({ applySync, onError = (e) => console.error(e) }) {
  let chain = Promise.resolve();
  let running = 0;
  let pendingSync = null;

  const flush = () => {
    if (running === 0 && pendingSync) {
      const s = pendingSync;
      pendingSync = null;
      applySync(s);
    }
  };

  return {
    run(task) {
      running++;
      chain = chain.then(task).catch(onError).finally(() => { running--; flush(); });
      return chain;
    },
    sync(state) {
      if (running === 0) applySync(state);
      else pendingSync = state;
    },
    idle: () => chain,
    get busy() { return running > 0; },
  };
}
