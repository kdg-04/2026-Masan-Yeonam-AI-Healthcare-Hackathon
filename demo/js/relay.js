// 두 페이지 실시간 연결 (README 2절)
// 각 페이지의 bus에 붙어서, 정해진 이벤트만 상대 페이지 bus로 옮긴다.
// 통로: Supabase Realtime broadcast(다른 기기) + BroadcastChannel(같은 브라우저, 오프라인). 둘 다 보내고 id로 중복 제거.

// 미러링: 실제 휴대폰 앱(app)이 화면 상태를 보내면, 시연 화면 오른쪽 아이폰 틀 앱(mirror)이 똑같이 그린다
export const MIRROR_EVENTS = ['mirror:state', 'mirror:toast'];
const TO_DEVICE = ['device:load', 'device:dispense', 'ui:selectSlot', 'device:travel', 'state:sync', 'scenario:reset', 'device:alarm'];
export const RELAY_EVENTS = {
  app: [...TO_DEVICE, ...MIRROR_EVENTS],
  device: ['device:loaded', 'device:dispensed', 'device:button', 'device:slotSelected', 'device:hello', 'device:reset'],
  mirror: [], // 미러는 보여 주기만 하고 아무것도 보내지 않는다 (기기에 명령이 두 번 가지 않게)
};
// 누가 누구에게서 어떤 이벤트를 받는지
const ACCEPTS = {
  device: { from: 'app', events: TO_DEVICE },
  app: { from: 'device', events: RELAY_EVENTS.device },
  mirror: { from: 'app', events: MIRROR_EVENTS },
};
const CHANNEL_PREFIX = 'pumix';

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function makeEnvelope(from, name, payload) {
  return { v: 1, id: uid(), from, name, payload, at: Date.now() };
}

/** 받아도 되는 봉투인지 검사하고, 받으면 seen에 id를 넣는다 */
export function acceptEnvelope(env, myRole, seen) {
  if (!env || typeof env !== 'object' || env.v !== 1 || typeof env.id !== 'string') return false;
  const rule = ACCEPTS[myRole];
  if (!rule || env.from !== rule.from || !rule.events.includes(env.name)) return false;
  if (seen.has(env.id)) return false;
  seen.add(env.id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  return true;
}

export function roomFromSearch(search) {
  const room = new URLSearchParams(search).get('room')?.toLowerCase() ?? '';
  return /^[a-z0-9-]{1,32}$/.test(room) ? room : 'demo';
}

/** 같은 브라우저(탭·창·iframe)끼리 — 인터넷 없이 동작 */
export function createLocalTransport(room) {
  const ch = new BroadcastChannel(`${CHANNEL_PREFIX}:${room}`);
  return {
    name: 'local',
    send: (env) => ch.postMessage(env),
    onMessage: (cb) => { ch.onmessage = (e) => cb(e.data); },
    onState: (cb) => cb('ready'),
    close: () => ch.close(),
  };
}

/** 다른 기기끼리 — Supabase Realtime broadcast (테이블 없이 신호만) */
export function createSupabaseTransport(room, { url, anonKey, createClient }) {
  const client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } });
  const ch = client.channel(`${CHANNEL_PREFIX}:${room}`, { config: { broadcast: { self: false } } });
  let onMsg = () => {};
  let onSt = () => {};
  ch.on('broadcast', { event: 'bus' }, ({ payload }) => onMsg(payload));
  ch.subscribe((status) => onSt(status === 'SUBSCRIBED' ? 'ready' : 'down'));
  return {
    name: 'remote',
    send: (env) => ch.send({ type: 'broadcast', event: 'bus', payload: env }),
    onMessage: (cb) => { onMsg = cb; },
    onState: (cb) => { onSt = cb; },
    close: () => client.removeChannel(ch),
  };
}

/**
 * 연결: bus의 이벤트 중 내 역할이 보내는 것만 모든 통로로 보내고, 받은 것은 bus.emit(..., { remote: true })
 * peerStatus(): 'remote'(다른 기기와 연결) | 'local'(같은 브라우저) | 'none'(상대 없음)
 */
export function connectRelay({ bus, role, room, transports, heartbeatMs = 5000, peerTimeoutMs = 10000 }) {
  const seen = new Set();
  const lastPeer = { remote: 0, local: 0 };
  const statusSubs = new Set();
  let lastStatus = 'none';

  const peerStatus = () => {
    const now = Date.now();
    if (now - lastPeer.remote < peerTimeoutMs) return 'remote';
    if (now - lastPeer.local < peerTimeoutMs) return 'local';
    return 'none';
  };
  const refresh = () => {
    const s = peerStatus();
    if (s !== lastStatus) { lastStatus = s; for (const fn of statusSubs) fn(s); }
  };

  const send = (name, payload) => {
    const env = makeEnvelope(role, name, payload);
    seen.add(env.id);
    for (const t of transports) {
      try { t.send(env); } catch (e) { console.warn(`[relay] ${t.name} 보내기 실패`, e); }
    }
  };

  for (const t of transports) {
    t.onMessage((env) => {
      if (!acceptEnvelope(env, role, seen)) return;
      lastPeer[t.name] = Date.now();
      refresh();
      bus.emit(env.name, env.payload, { remote: true, via: t.name });
    });
  }

  const offAny = bus.onAny((name, payload, meta) => {
    if (meta.remote || !RELAY_EVENTS[role].includes(name)) return;
    send(name, payload);
  });

  // 상대가 살아 있는지: 기기는 주기적으로 hello, 앱은 state:sync로 답한다(app.js)
  let timer = null;
  if (heartbeatMs > 0) {
    timer = setInterval(() => {
      if (role === 'device') bus.emit('device:hello', {});
      refresh();
    }, heartbeatMs);
  }

  return {
    room,
    peerStatus,
    onStatus(fn) { statusSubs.add(fn); fn(lastStatus); return () => statusSubs.delete(fn); },
    close() {
      offAny();
      if (timer) clearInterval(timer);
      for (const t of transports) t.close();
    },
  };
}

/** 브라우저용: config.js를 보고 통로를 골라 연결
 *  ?relay=local → 같은 브라우저 통로만 (인터넷 없이 한 노트북에서 앱·기기를 창 두 개로 열 때)
 *  supabase-js는 UMD(vendor/supabase.js)로 넣어 전역 supabase.createClient를 쓴다 (README 2-5) */
export function startRelay({ bus, role, config }) {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const room = roomFromSearch(globalThis.location?.search ?? '');
  const localOnly = params.get('relay') === 'local';
  const transports = [createLocalTransport(room)];
  const createClient = globalThis.supabase?.createClient;
  if (!localOnly && config?.SUPABASE_URL && config?.SUPABASE_ANON_KEY) {
    if (createClient) transports.push(createSupabaseTransport(room, { url: config.SUPABASE_URL, anonKey: config.SUPABASE_ANON_KEY, createClient }));
    else console.warn('[relay] vendor/supabase.js가 없어 같은 브라우저 연결만 사용해요');
  }
  const relay = connectRelay({ bus, role, room, transports });
  relay.mode = transports.length > 1 ? 'remote' : 'local';
  return relay;
}
