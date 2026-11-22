// 기기 페이지: 화면만 그린다. 상태는 앱이 보내는 state:sync로 받는다 (README 2절)
import { bus } from '../store.js';
import { startRelay } from '../relay.js';
import * as config from '../config.js';
import { createDeviceQueue } from './queue.js';
import { createOnce, newId, createSourceLock } from '../once.js';
import * as device from './device3d.js';

const $ = (id) => document.getElementById(id);
let last = null;          // 마지막으로 받은 state:sync
let ready = false;        // 3D 기기를 그렸는지
let relay;
let alarmOn = false;      // 복용 알람이 울리는 중인지 (기기 상태 줄 문구용)

const display = (text) => { $('display-text').textContent = text; };
let noteTimer;
function note(text) {
  const el = $('device-note');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

const readyText = () => `준비됨, ${last?.slots.filter((x) => x.productId).length ?? 0}칸 사용 중`;

function applySync(s) {
  last = s;
  if (!ready) {
    device.init($('machine'), s.slots, s.products);
    device.onSlotClick((slot) => bus.emit('device:slotSelected', { slot }));
    device.onModeChange((on) => display(on ? '외출 모드: 파우치로 포장해요' : '집에서: 컵에 바로 담아요'));
    device.onPouchZoom((on) => { if (on) note('파우치를 크게 보는 중 · 아무 곳이나 누르면 돌아가요'); });
    device.onMemberClick((memberId) => {
      if (relay.peerStatus() === 'none') { note('앱이 연결되지 않았어요'); return; }
      bus.emit('device:button', { memberId, id: newId() });
    });
    ready = true;
    $('waiting').hidden = true;
  } else {
    device.updateSlots(s.slots, s.products);
  }
  device.setMembers(s.members);
  device.setToday(s.today ?? null);
  if (!alarmOn) display(readyText());
}

const queue = createDeviceQueue({ applySync, onError: (e) => { console.error(e); display('동작 중 문제가 생겼어요'); } });
const productOf = (id) => last?.products.find((p) => p.id === id);

// 앱 창이 여러 개여도 한 앱의 상태만 따른다 (서로 다른 상태가 번갈아 와서 화면이 깜빡이던 문제)
const acceptSync = createSourceLock(12000);
// 처음 보는 앱(새로 열거나 새로고침)이면 바로 hello로 답한다: 앱이 기기 연결을 5초(다음 hello)까지 모르고
// "기기 페이지가 연결되지 않았어요"를 띄우던 문제
const knownApps = new Set();
bus.on('state:sync', (s) => {
  if (s.appId && !knownApps.has(s.appId)) { knownApps.add(s.appId); bus.emit('device:hello', {}); }
  if (s.claim) acceptSync.claim(s.appId);
  if (acceptSync(s.appId)) queue.sync(s);
});
const follow = (appId) => acceptSync.claim(appId); // 사람이 조작한 앱을 따름

bus.on('device:load', ({ productId, slot, appId }) => (follow(appId), queue.run(async () => {
  if (!ready) return;
  display(`${slot}번 칸으로 옮기는 중`);
  await device.load(productId, slot);
  bus.emit('device:loaded', { productId, slot });
  display(`${slot}번 칸에 넣었어요`);
})));

// 같은 배출 요청(id)은 한 번만: 앱 창이 여러 개면 버튼 한 번에 명령이 여러 개 온다
const firstDispense = createOnce();
bus.on('device:dispense', ({ id, memberId, round, items, label, mode, appId }) => firstDispense(id) && (follow(appId), queue.run(async () => {
  if (!ready) return;
  const rich = items.map((it) => {
    const pid = last.slots.find((x) => x.slot === it.slot)?.productId;
    const p = productOf(pid);
    return { ...it, color: p?.color ?? '#cccccc', form: p?.form ?? '정', name: p?.name ?? '' };
  });
  alarmOn = false;
  if (mode === 'cup' || mode === 'pouch') await device.setOuting(mode === 'pouch'); // 앱에서 고른 방식으로 기기 모드도 바꿈(터치 화면 표시도 같이)
  display(`${label} 배출 중`);
  const done = await device.dispense(rich, label, rich.map((r) => `${r.name.replace(/\(.*?\)/g, '').trim()} ×${r.count}`)); // 'cup' | 'pouch'
  display(done === 'pouch' ? `${label} 밀봉 완료` : `${label} 컵에 담았어요`);
  bus.emit('device:dispensed', { id, memberId, round, at: Date.now(), mode: done });
})));

bus.on('ui:selectSlot', ({ slot, appId }) => { follow(appId); if (ready) device.highlightSlot(slot); });

// 복용 알람: 앱이 알람을 울리면 뚜껑 링·화면이 주황으로 깜빡이고, 그 사람 버튼을 누르면 배출 (끄면 alarm: null)
bus.on('device:alarm', ({ alarm, appId }) => {
  follow(appId);
  if (!ready) return;
  alarmOn = !!alarm;
  device.setAlarm(alarm);
  if (alarm) display(`${alarm.title}님 ${alarm.roundName} 복용 시간 (${alarm.time})`);
  else if (!queue.busy) display(readyText()); // 배출 중이면 '배출 중' 표시를 덮지 않음 (앱 창이 여럿이면 끄기 신호가 배출보다 늦게 올 수 있음)
});

// 내부 보기: 몸체를 반투명하게 (키보드 X로도)
const xrayBtn = $('xray');
const toggleXray = async () => { if (!ready || device.isBusy()) return; if (device.isPouchZoomed()) await device.zoomPouch(false); await device.toggleXray(); xrayBtn.setAttribute('aria-pressed', String(device.isXray())); };
xrayBtn?.addEventListener('click', toggleXray);
window.addEventListener('keydown', (e) => {
  if (e.key === 'x' || e.key === 'X') toggleXray();
  if (e.key === 't' || e.key === 'T') toggleOuting();
  if (e.key === 'Escape' && ready && device.isPouchZoomed()) device.zoomPouch(false); // 파우치 확대에서 돌아가기
});

// 외출 모드: 기기 화면의 [집에서 · 컵 | 외출 · 파우치]를 누르거나 키보드 T
async function toggleOuting() {
  if (!ready || device.isBusy()) return;
  await device.setOuting(!device.isOuting());
}
// 시나리오 초기화: 기기도 처음 상태로(컵 모드·출구 비움·속 보기 끔·알람 끔·카메라 처음 자리). 칸·가족은 뒤따라 오는 state:sync로
bus.on('scenario:reset', ({ appId, resetId } = {}) => {
  follow(appId);
  alarmOn = false;
  bus.emit('device:reset', { appId, resetId }); // 같은 방의 다른 앱도 처음으로
  if (!ready) return;
  queue.run(async () => {
    await device.reset();
    xrayBtn?.setAttribute('aria-pressed', 'false');
    note('처음 상태로 돌아왔어요'); // 상태 줄은 뒤따라 오는 state:sync가 '준비됨'으로 바꿈
  });
});

async function main() {
  relay = await startRelay({ bus, role: 'device', config });
  $('room').textContent = relay.room;
  const appUrl = `${location.origin}${location.pathname.replace(/device(\.html)?$/, 'app.html')}?room=${relay.room}`;
  $('app-url').textContent = appUrl;
  // 휴대폰 카메라로 찍으면 같은 방 앱이 열린다 (vendor/qrcode.js, 인터넷 없이 만듦). 같은 브라우저 전용(분할 화면)일 때는 안 띄움
  if (globalThis.qrcode && relay.mode === 'remote') {
    const qr = globalThis.qrcode(0, 'M');
    qr.addData(appUrl);
    qr.make();
    $('app-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  }
  const dot = $('conn');
  relay.onStatus((st) => {
    dot.dataset.status = st;
    dot.querySelector('span').textContent = { remote: '앱 연결됨', local: '앱 연결됨(같은 브라우저)', none: '앱 없음' }[st];
  });
  bus.emit('device:hello', {});
}

main().catch((e) => { console.error(e); display('불러오지 못했어요'); });
window.__yyDevice = { bus, device, queue };
