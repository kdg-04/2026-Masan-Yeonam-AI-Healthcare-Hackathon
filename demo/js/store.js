// 상태 + 이벤트 버스 (상태의 유일한 원천 = 앱 페이지의 store)
// 화면·기기 코드는 bus.on / bus.emit 만 쓴다. 다른 페이지로 옮기는 건 relay.js가 한다.

export function createBus() {
  const handlers = new Map();
  const anyHandlers = new Set();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    /** meta.remote = 다른 페이지에서 relay로 들어온 이벤트 */
    emit(name, payload, meta = {}) {
      for (const fn of [...(handlers.get(name) ?? [])]) {
        try { fn(payload, meta); } catch (e) { console.error(`[bus] ${name}`, e); }
      }
      for (const fn of [...anyHandlers]) fn(name, payload, meta);
    },
    onAny(fn) {
      anyHandlers.add(fn);
      return () => anyHandlers.delete(fn);
    },
  };
}

export function createStore(initial = {}) {
  const subs = new Set();
  const store = {
    state: structuredClone(initial),
    set(path, value) {
      const keys = path.split('.');
      let obj = store.state;
      for (const k of keys.slice(0, -1)) obj = obj[k] ??= {};
      obj[keys.at(-1)] = value;
      notify();
    },
    update(fn) {
      fn(store.state);
      notify();
    },
    reset(next) {
      store.state = structuredClone(next);
      notify();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  function notify() { for (const fn of [...subs]) fn(store.state); }
  return store;
}

export const bus = createBus();
export const store = createStore({});

const DATA_FILES = {
  members: 'members', meds: 'meds', products: 'products', slots: 'slots', presets: 'presets',
  limits: 'limits', interactions: 'interactions', copy: 'copy', health: 'health', logs: 'logs',
  guideRules: 'guide-rules', ocr: 'ocr-mock',
};

/** data/*.json 을 모두 읽어 store.state 모양으로 */
export async function loadData(base = './data/') {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, file]) => {
      // 요청이 한 번 끊겨도(로컬 서버 혼잡·약한 와이파이) 앱이 멈추지 않게 두 번까지 다시 받는다
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(`${base}${file}.json`);
          if (!res.ok) throw new Error(`${file}.json 을 읽지 못했어요 (${res.status})`);
          return [key, await res.json()];
        } catch (e) {
          if (attempt >= 2) throw e;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }),
  );
  return Object.fromEntries(entries);
}
