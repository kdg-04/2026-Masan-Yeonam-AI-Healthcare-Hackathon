// 3D 디스펜서 v2.1 — 콘셉트 렌더(세로형 그래파이트 몸체·파란 링·터치 화면·조명 출구)를 three.js로 재현.
// 내부는 구조 단면도처럼: 12칸 트레이 디스크, 투입 모듈(호퍼·가공 하우징·레일·노즐), 곡선 이송 슈트,
// 모터 구동부(스테퍼·기어·벨트), 습도 제어장치(케이스·격자·팬), 제어 보드, 전원, 포장 모듈(롤러·히터 바), 프레임.
// 내보내는 함수는 v1과 같다: init, setMembers, onSlotClick, onMemberClick, updateSlots, highlightSlot,
// rotateTo, isBusy, load, dispense + setXray, toggleXray, isXray
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ───── 치수 (단위: 대략 10cm) ───── */
const BODY_W = 2.4, BODY_H = 3.7, BODY_D = 1.25, BEVEL = 0.4;
const FRONT_Z = BODY_D / 2 + BEVEL;
const SCREEN = { w: 1.8, h: 1.86, r: 0.44, y: 2.5 };
const NICHE = { w: 1.9, h: 1.2, r: 0.26, y: 0.84, depth: 0.74 };
const NICHE_TOP = NICHE.y + (NICHE.h - 0.03) / 2;
const NICHE_ROUND = 0.18; // 출구 모서리 둥글기
const DISC = { y: 1.98, z: -0.06, rIn: 0.2, rOut: 0.74, wall: 0.75 };
const BIN_TOP = DISC.y + DISC.wall;                 // 약통 윗면
const R_MID = (DISC.rIn + DISC.rOut) / 2 + 0.02;
const FEED_Z = DISC.z + R_MID;                      // 6시 칸(앞) 위치 — 투입·배출 모두 여기서
const POUCH_Z = FRONT_Z - NICHE.depth + 0.36;
const POUCH = { w: 0.7, h: 0.62, d: 0.06, labelY: -0.14 }; // 파우치 필름 크기, 라벨 중심 높이(위쪽 기준)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let scene, camera, renderer, controls, clock;
let shellMats = [], softMats = [], screenMesh, screenTex, screenCanvas, ringMat, stripMat;
let disc, hinge, sealTop, sealBottom, sealMat, fan, chuteCurve, desiccantMat;
let compartments = new Map();  // slot → { mesh(바닥, 클릭·강조), mat, clock, pills: [], group }
let products = new Map();
let members = [];
let discAngle = 0, busy = false, xray = 0, xrayTimer = null;
let currentPouch = null;
let outing = false;            // 외출 모드: 파우치에 담아 밀봉. 꺼져 있으면 컵에 바로 담음
let roll, rollCore, cup, cupPills = [], sealCover = null;
let modeCb = () => {};
const NICHE_BOT = NICHE.y - (NICHE.h - 0.03) / 2;
const CUP = { home: new THREE.Vector3(), fill: new THREE.Vector3() }; // home: 출구 정면 대기, fill: 슈트 아래(약 받는 자리)
let slotClickCb = () => {}, memberClickCb = () => {};
const ui = { status: '준비됨', progress: 0, pills: [], time: 0, active: null, done: false, buttons: [], modeButtons: [], humid: null, outing: false, today: null, alarm: null, blink: false };
let pouchZoom = null;           // 파우치 확대 중이면 돌아갈 카메라 자리 { pos, target }
let pouchZoomCb = () => {};

/* ───── 재질 ───── */
const M = {
  alu: new THREE.MeshPhysicalMaterial({ color: '#c9cfd6', metalness: 0.92, roughness: 0.26, envMapIntensity: 1.3 }),
  aluDark: new THREE.MeshPhysicalMaterial({ color: '#7d848d', metalness: 0.9, roughness: 0.32 }),
  anod: new THREE.MeshPhysicalMaterial({ color: '#2c3036', metalness: 0.7, roughness: 0.35 }),
  plastic: new THREE.MeshPhysicalMaterial({ color: '#f1f3f5', roughness: 0.38, clearcoat: 0.4 }),
  clear: new THREE.MeshPhysicalMaterial({ color: '#e9f1fa', transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  screw: new THREE.MeshStandardMaterial({ color: '#5d636b', metalness: 0.9, roughness: 0.3 }),
  edge: new THREE.LineBasicMaterial({ color: '#0e1116', transparent: true, opacity: 0.55 }),
  edgeLight: new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }),
};

/* ───── 도우미 ───── */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function tween(ms, step) {
  if (reduced) ms = Math.min(ms, 120);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.max(0, Math.min(1, (now - t0) / ms)); // rAF 시각이 시작보다 앞설 수 있어 0 아래로 내려가지 않게
      step(ease(t), t);
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

function roundedRect(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function bodyProfile() {
  const w = BODY_W, h = BODY_H, rt = 0.95, rb = 0.45, x = -w / 2;
  const s = new THREE.Shape();
  s.moveTo(x + rb, 0);
  s.lineTo(x + w - rb, 0); s.quadraticCurveTo(x + w, 0, x + w, rb);
  s.lineTo(x + w, h - rt); s.bezierCurveTo(x + w, h - rt * 0.35, x + w - rt * 0.35, h, x + w - rt, h);
  s.lineTo(x + rt, h); s.bezierCurveTo(x + rt * 0.35, h, x, h - rt * 0.35, x, h - rt);
  s.lineTo(x, rb); s.quadraticCurveTo(x, 0, x + rb, 0);
  return s;
}
function normalizeUV(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y));
  uv.needsUpdate = true;
  return geo;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, canvas: c };
}
/** 모서리가 둥근 상자 (가공 부품 느낌), 가운데 기준 */
function rbox(w, h, d, r = 0.03, mat = M.alu, edges = true) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * r, h - 2 * r, Math.min(r, 0.02)), { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  const m = new THREE.Mesh(g, mat);
  if (edges) addEdges(m);
  return m;
}
function addEdges(mesh, mat = M.edge, angle = 30) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), mat);
  mesh.add(e);
  return mesh;
}
function cyl(rTop, rBot, h, mat, seg = 24, open = false) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat);
}
function screw(parent, x, y, z, axis = 'z') {
  const s = cyl(0.018, 0.018, 0.012, M.screw, 12);
  if (axis === 'z') s.rotation.x = Math.PI / 2;
  if (axis === 'x') s.rotation.z = Math.PI / 2;
  s.position.set(x, y, z);
  parent.add(s);
}
const clockPos = (clockNo, r, y) => {
  const a = THREE.MathUtils.degToRad(clockNo * 30);
  return new THREE.Vector3(r * Math.sin(a), y, -r * Math.cos(a));
};
function sectorShape(clockNo, half = 14.5, rIn = DISC.rIn + 0.01, rOut = DISC.rOut - 0.01) {
  const a0 = THREE.MathUtils.degToRad(clockNo * 30 - half), a1 = THREE.MathUtils.degToRad(clockNo * 30 + half);
  const P = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
  const s = new THREE.Shape();
  s.moveTo(...P(rIn, a0));
  for (let i = 0; i <= 10; i++) s.lineTo(...P(rOut, a0 + ((a1 - a0) * i) / 10));
  for (let i = 10; i >= 0; i--) s.lineTo(...P(rIn, a0 + ((a1 - a0) * i) / 10));
  return s;
}
const pillGeo = {
  capsule: new THREE.CapsuleGeometry(0.034, 0.08, 4, 12),
  tablet: new THREE.CylinderGeometry(0.048, 0.048, 0.03, 20),
};
const pillMats = new Map();
/** 칸에 보이는 알약 수: 잔량 1.2회분당 1알, 최대 45알 */
const slotCount = (remaining) => Math.min(45, Math.max(1, Math.round(remaining / 1.2)));
/** 칸 안 i번째 알약 자리(칸 그룹 기준)와 회전 — updateSlots와 넣기 장면이 같은 자리를 써서 넣은 뒤 알약이 튀지 않게 */
function slotPillPose(c, i) {
  const row = i % 4, layer = Math.floor(i / 6);
  const r = DISC.rIn + 0.1 + row * 0.12;
  const da = ((Math.floor(i / 4) % 2) ? 1 : -1) * 6 + ((i * 7) % 5 - 2);
  return { pos: clockPos(c.clock + da / 30, r, 0.03 + layer * 0.045), rotY: i * 1.3 };
}
function pillMesh(color, form, scale = 1) {
  const capsule = form === '캡슐';
  const key = `${color}-${capsule}`;
  if (!pillMats.has(key)) pillMats.set(key, new THREE.MeshPhysicalMaterial({ color, roughness: capsule ? 0.12 : 0.5, clearcoat: capsule ? 1 : 0.2 }));
  const m = new THREE.Mesh(capsule ? pillGeo.capsule : pillGeo.tablet, pillMats.get(key));
  m.scale.setScalar(scale);
  if (capsule) m.rotation.z = Math.PI / 2;
  return m;
}

/* ───── 터치 화면 (캔버스) ───── */
const SCR_W = 720, SCR_H = 744;
function drawScreen() {
  if (!screenCanvas) return;
  const g = screenCanvas.getContext('2d');
  const W = SCR_W, H = SCR_H;
  const grad = g.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, W * 0.7);
  grad.addColorStop(0, '#121821'); grad.addColorStop(1, '#07090c');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const font = (wt, px) => `${wt} ${px}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
  const pill = (x, y, w, h, fill, stroke) => {
    g.beginPath(); g.roundRect(x, y, w, h, h / 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.stroke(); }
  };
  g.textAlign = 'center';
  pill(W / 2 - 34, 34, 68, 10, '#c9d2dd');
  const cx = W / 2, cy = 180, R = 92;
  const dispensing = ui.pills.length > 0;
  const t = ui.today;
  const frac = dispensing ? ui.progress : (t && t.total ? t.done / t.total : 0);
  g.lineWidth = 16; g.strokeStyle = '#18332c'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if (frac > 0) {
    g.strokeStyle = '#4fe3b8'; g.lineCap = 'round'; g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac)); g.stroke();
    g.lineCap = 'butt';
  }
  if (dispensing) {
    // 배출 중: 링 가운데 알약, 아래 줄에 지금 나오는 약
    g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4);
    pill(-46, -20, 92, 40, '#e8eef6'); g.fillStyle = '#7fb8f0'; g.beginPath(); g.roundRect(0, -20, 46, 40, [0, 20, 20, 0]); g.fill();
    g.restore();
    pill(70, 300, W - 140, 84, '#161c24');
    const pills = ui.pills.slice(0, 6);
    const gap = (W - 140) / (pills.length + 1);
    pills.forEach((p, i) => {
      const x = 70 + gap * (i + 1), y = 342;
      g.fillStyle = p.color;
      g.beginPath();
      if (p.form === '캡슐') g.ellipse(x, y, 34, 17, -0.4, 0, 6.3); else g.ellipse(x, y, 20, 18, 0, 0, 6.3);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - 6, y - 6, 9, 4, -0.4, 0, 6.3); g.fill();
    });
  } else if (ui.alarm) {
    // 복용 알람: 링이 주황으로 차고, 가운데 시간, 아래에 누를 버튼 안내
    const a = ui.alarm;
    g.lineWidth = 16; g.strokeStyle = ui.blink ? '#ffb36b' : '#8a5a22'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffe3c2'; g.font = font(700, 56); g.fillText(a.time.replace(/^오[전후] /, ''), cx, cy + 12);
    g.fillStyle = '#ffb36b'; g.font = font(600, 22); g.fillText(`${a.roundName} 복용 시간`, cx, cy + 48);
    g.fillStyle = '#ffd3a1'; g.font = font(700, 32); g.fillText(`${a.title}님 버튼을 눌러 주세요`, cx, 340);
  } else if (t) {
    // 기다릴 때: 링 가운데 오늘 가족 복용 (먹은 회차 / 전체 회차), 아래에 다음 차례
    g.fillStyle = '#eef3f8'; g.font = font(700, 58); g.fillText(`${t.done}/${t.total}`, cx, cy + 14);
    g.fillStyle = '#8b96a3'; g.font = font(500, 22); g.fillText('오늘 복용', cx, cy + 48);
    g.fillStyle = '#eef3f8'; g.font = font(600, 32);
    g.fillText(t.next ? `${t.next.title}님 ${t.next.round}회차 차례예요` : '오늘 복용을 모두 마쳤어요', cx, 340);
  }
  if (ui.humid != null) { g.fillStyle = ui.humid >= 50 ? '#ffb37a' : '#7fd0ff'; g.font = font(600, 22); g.fillText(`내부 습도 ${ui.humid}%`, cx, dispensing ? 426 : 392); }
  // 외출 모드 전환 (누르면 바뀜): 집에서는 컵으로 바로, 외출이면 파우치로 밀봉
  const modes = [{ id: 'home', label: '집에서 · 컵', on: !ui.outing }, { id: 'outing', label: '외출 · 파우치', on: ui.outing }];
  pill(70, 484, W - 140, 66, '#161c24');
  ui.modeButtons = [];
  const mw = (W - 140 - 12) / 2;
  modes.forEach((m, i) => {
    const x = 76 + i * (mw + 0), y = 490, w = mw - 6, h = 54;
    if (m.on) pill(x, y, w, h, m.id === 'outing' ? '#3a2a12' : '#13302a', m.id === 'outing' ? '#ffb36b' : '#4fe3b8');
    g.fillStyle = m.on ? (m.id === 'outing' ? '#ffd3a1' : '#e6fff7') : '#8b96a3'; g.font = font(700, 25); g.fillText(m.label, x + w / 2, y + 36);
    ui.modeButtons.push({ id: m.id, x, y, w, h });
  });
  ui.buttons = [];
  const n = Math.max(1, members.length), bw = (W - 140 - 12 * (n - 1)) / n;
  members.forEach((m, i) => {
    const x = 70 + i * (bw + 12), y = 574, h = 78;
    const on = ui.active === m.id;
    const ring = !on && ui.alarm?.memberId === m.id; // 알람 차례인 사람 버튼은 주황으로 깜빡임
    pill(x, y, bw, h, on ? '#4fe3b8' : ring ? (ui.blink ? '#ffb36b' : '#3a2a12') : '#202833', ring ? '#ffb36b' : null);
    g.fillStyle = on ? '#06231b' : ring ? (ui.blink ? '#2a1a06' : '#ffd3a1') : '#eef3f8'; g.font = font(700, 28); g.fillText(m.title, x + bw / 2, y + 50);
    ui.buttons.push({ id: m.id, x, y, w: bw, h });
  });
  g.fillStyle = ui.done ? '#4fe3b8' : '#8b96a3'; g.font = font(ui.done ? 700 : 500, 24);
  g.fillText(ui.status, W / 2, 706);
  if (screenTex) screenTex.needsUpdate = true;
}
function setUI(patch) { Object.assign(ui, patch); drawScreen(); }

/* ───── 만들기 ───── */
export function init(container, slots, productList) {
  products = new Map(productList.map((p) => [p.id, p]));
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(1.5, 5.0, 11.8);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.localClippingEnabled = true; // 출구를 몸체에서 직사각형 상자로 잘라냄
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(5, 4, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x101318, 0.35));
  const inner = new THREE.PointLight('#dfe9ff', 1.2, 4, 1.5); inner.position.set(-0.6, 3.0, 0.6); scene.add(inner);

  const shadowTex = canvasTex(256, 256, (g, W) => { const r = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.55, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, W, W); }).tex;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -BEVEL - 0.005;
  scene.add(floor);

  buildBody();
  buildFrame();
  buildDisc();
  buildInputModule();
  buildMotor();
  buildChute();
  buildHumidity();
  buildBoard();
  buildPower();
  buildNiche();
  buildSealer(); buildSealCover();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.75, 0);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.enablePan = false;

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  // 파우치 위에 올리면 손가락 커서 (누르면 확대)
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons || !currentPouch) { renderer.domElement.style.cursor = ''; return; }
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    renderer.domElement.style.cursor = pouchZoom || (!busy && ray.intersectObject(currentPouch, true).length) ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    if (pouchZoom) { zoomPouch(false); return; } // 확대 중에는 어디를 눌러도 돌아감
    const targets = [screenMesh];
    if (xray > 0.5) targets.push(...[...compartments.values()].map((c) => c.mesh));
    const hit = ray.intersectObjects(targets, false)[0];
    const pouchHit = currentPouch && !busy ? ray.intersectObject(currentPouch, true)[0] : null;
    if (pouchHit && (!hit || pouchHit.distance < hit.distance)) { zoomPouch(true); return; }
    if (!hit) return;
    if (hit.object === screenMesh && hit.uv) {
      const x = hit.uv.x * SCR_W, y = (1 - hit.uv.y) * SCR_H;
      const inside = (bt) => x >= bt.x && x <= bt.x + bt.w && y >= bt.y && y <= bt.y + bt.h;
      const mb = ui.modeButtons.find(inside);
      if (mb) { if (!busy && (mb.id === 'outing') !== outing) setOuting(mb.id === 'outing'); return; }
      const b = ui.buttons.find(inside);
      if (b) { flashMember(b.id); memberClickCb(b.id); }
    } else if (hit.object.userData.slot) slotClickCb(hit.object.userData.slot);
  });

  new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }).observe(container);

  let ringLit = false;
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (ui.alarm) {
      // 복용 알람: 뚜껑 링이 주황으로 숨 쉬듯 깜빡이고, 화면의 차례 버튼도 0.5초마다 깜빡임
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      ringMat.color.set('#ffc58a'); ringMat.emissive.set('#ff9a2e'); ringMat.emissiveIntensity = 0.8 + 2.8 * k;
      ringLit = true;
      const blink = Math.floor(t * 2) % 2 === 0;
      if (blink !== ui.blink) setUI({ blink });
    } else if (ringLit) {
      ringMat.color.set('#7fd0ff'); ringMat.emissive.set('#3fb2ff'); ringMat.emissiveIntensity = 2.4;
      ringLit = false;
    }
    controls.update();
    renderer.render(scene, camera);
  });
  updateSlots(slots, productList);
  drawScreen();
  document.fonts?.ready.then(drawScreen);
}

function buildBody() {
  const shellMat = new THREE.MeshPhysicalMaterial({ color: '#5a5f67', metalness: 0.62, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.5 });
  shellMats.push(shellMat);
  const prof = bodyProfile();
  // 출구: 몸체 둥근 모서리를 따라 좁아지는 구멍 대신, 반듯한 직사각형 상자로 잘라냄 (클리핑 6면 교집합)
  const nw = (NICHE.w - 0.03) / 2, z0 = FRONT_Z - NICHE.depth - 0.005;
  shellMat.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -nw), new THREE.Plane(new THREE.Vector3(-1, 0, 0), -nw),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -NICHE_TOP), new THREE.Plane(new THREE.Vector3(0, -1, 0), NICHE_BOT),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), z0),
  ];
  shellMat.clipIntersection = true;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: BODY_D, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 12, curveSegments: 40 }), shellMat);
  body.position.z = -BODY_D / 2;
  scene.add(body);
  // 출구 테두리: 얇은 직사각형 트림
  const trimShape = roundedRect(NICHE.w + 0.06, NICHE.h + 0.06, NICHE_ROUND + 0.04, 0, NICHE.y);
  trimShape.holes.push(roundedRect(NICHE.w - 0.03, NICHE.h - 0.03, NICHE_ROUND, 0, NICHE.y));
  const trim = new THREE.Mesh(new THREE.ShapeGeometry(trimShape, 8), new THREE.MeshPhysicalMaterial({ color: '#7d848d', metalness: 0.9, roughness: 0.3 }));
  trim.position.z = FRONT_Z + 0.002;
  scene.add(trim);

  const bezelMat = new THREE.MeshPhysicalMaterial({ color: '#9aa1aa', metalness: 1, roughness: 0.22 });
  shellMats.push(bezelMat);
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(SCREEN.w + 0.1, SCREEN.h + 0.1, SCREEN.r + 0.05, 0, SCREEN.y), 24), bezelMat);
  bezel.position.z = FRONT_Z + 0.003;
  scene.add(bezel);
  const sc = canvasTex(SCR_W, SCR_H, () => {});
  screenCanvas = sc.canvas; screenTex = sc.tex;
  screenMesh = new THREE.Mesh(normalizeUV(new THREE.ShapeGeometry(roundedRect(SCREEN.w, SCREEN.h, SCREEN.r, 0, SCREEN.y), 24)), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true }));
  screenMesh.position.z = FRONT_Z + 0.008;
  scene.add(screenMesh);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(SCREEN.w, SCREEN.h, SCREEN.r, 0, SCREEN.y), 24),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false }));
  glass.position.z = FRONT_Z + 0.014;
  scene.add(glass);

  hinge = new THREE.Group();
  hinge.position.set(0, BODY_H + BEVEL - 0.07, -0.62);
  scene.add(hinge);
  const lidGeo = new THREE.ExtrudeGeometry(roundedRect(1.62, 1.24, 0.56), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5, curveSegments: 24 });
  lidGeo.rotateX(-Math.PI / 2);
  const lidMat = new THREE.MeshPhysicalMaterial({ color: '#676d75', metalness: 0.6, roughness: 0.26, clearcoat: 0.9, envMapIntensity: 1.5 });
  shellMats.push(lidMat);
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.set(0, 0, 0.62);
  hinge.add(lid);
  ringMat = new THREE.MeshStandardMaterial({ color: '#7fd0ff', emissive: '#3fb2ff', emissiveIntensity: 2.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 12, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.18, 0.62);
  hinge.add(ring);
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.42, 48), new THREE.MeshBasicMaterial({ color: '#3fb2ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.185, 0.62);
  hinge.add(glow);
}

/** 뒤쪽 알루미늄 프레임 (압출 기둥 + 가로 보) + 디스크 받침 판 */
function buildFrame() {
  const slotTex = canvasTex(32, 256, (g, W, H) => { g.fillStyle = '#c9cfd6'; g.fillRect(0, 0, W, H); g.fillStyle = '#8c939b'; g.fillRect(W / 2 - 3, 0, 6, H); }).tex;
  const extr = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: slotTex, metalness: 0.9, roughness: 0.3 });
  for (const x of [-0.98, 0.98]) {
    const post = rbox(0.09, 4.0, 0.09, 0.012, extr);
    post.position.set(x, 1.62, -0.78);
    scene.add(post);
  }
  for (const y of [-0.22, 1.62, 3.55]) {
    const beam = rbox(2.05, 0.07, 0.07, 0.01, M.alu);
    beam.position.set(0, y, -0.78);
    scene.add(beam);
  }
}

/** 12칸 세로형 회전 약통: 바닥·칸막이·바깥 벽(투명 창)·위 뚜껑(투입구)·가스켓·가운데 건조제 기둥 */
function buildDisc() {
  disc = new THREE.Group();
  disc.position.set(0, DISC.y, DISC.z);
  scene.add(disc);
  const H = DISC.wall;
  const base = cyl(DISC.rOut + 0.03, DISC.rOut + 0.03, 0.04, M.plastic, 72);
  base.position.y = -0.02; disc.add(base); addEdges(base, M.edge, 40);
  // 바깥 벽: 아래 띠는 흰 플라스틱, 위는 내용물이 보이는 반투명 창
  const bandMat = M.plastic.clone(); bandMat.side = THREE.DoubleSide;
  const band = cyl(DISC.rOut + 0.02, DISC.rOut + 0.02, 0.12, bandMat, 72, true);
  band.position.y = 0.06; disc.add(band);
  const windowMat = new THREE.MeshPhysicalMaterial({ color: '#eef4fa', transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const wall = cyl(DISC.rOut + 0.02, DISC.rOut + 0.02, H - 0.12, windowMat, 72, true);
  wall.position.y = 0.12 + (H - 0.12) / 2; disc.add(wall);
  for (const y of [0.12, H]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(DISC.rOut + 0.02, 0.012, 8, 96), M.plastic);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; disc.add(ring);
  }
  // 칸막이 12장 (세로로 긴 판)
  const divMat = new THREE.MeshPhysicalMaterial({ color: '#f3f5f7', transparent: true, opacity: 0.85, roughness: 0.35 });
  for (let k = 0; k < 12; k++) {
    const len = DISC.rOut - DISC.rIn;
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.012, H, len), divMat);
    const a = THREE.MathUtils.degToRad(k * 30 + 15);
    const r = DISC.rIn + len / 2;
    div.position.set(r * Math.sin(a), H / 2, -r * Math.cos(a));
    div.rotation.y = -a;
    disc.add(div);
  }
  // 가운데 기둥 = 교체형 건조제 카트리지. 약을 넣는 칸이 아니다(11-21 사용자: 가운데는 약통으로 쓰지 않음).
  // 알약처럼 보이던 알갱이 대신, 구멍 뚫린 흰 통 + 좁은 습도 표시창(주황=건조, 초록=교체)만 보인다
  const ventTex = canvasTex(128, 256, (g, W, Hh) => {
    g.fillStyle = '#eef1f4'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#aeb6c0';
    for (let y = 10, row = 0; y < Hh; y += 16, row++) for (let x = row % 2 ? 8 : 16; x < W; x += 16) { g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill(); }
  }).tex;
  ventTex.wrapS = THREE.RepeatWrapping; ventTex.repeat.set(3, 1);
  const cartridge = cyl(DISC.rIn - 0.012, DISC.rIn - 0.012, H, new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: ventTex, roughness: 0.5, clearcoat: 0.3 }), 40);
  cartridge.position.y = H / 2; disc.add(cartridge);
  desiccantMat = new THREE.MeshStandardMaterial({ color: '#f29a3a', roughness: 0.4 });
  const indicator = new THREE.Mesh(new THREE.CylinderGeometry(DISC.rIn - 0.006, DISC.rIn - 0.006, H * 0.55, 24, 1, true, -0.22, 0.44), desiccantMat);
  indicator.position.y = H / 2; disc.add(indicator);
  // 위 뚜껑: 투명 판 + 가스켓(검은 고무 링) + 숫자 판 + 투입구 자리
  const lidTop = new THREE.Mesh(new THREE.CylinderGeometry(DISC.rOut + 0.03, DISC.rOut + 0.03, 0.02, 72), new THREE.MeshPhysicalMaterial({ color: '#e8f0f8', transparent: true, opacity: 0.35, roughness: 0.08, clearcoat: 1, depthWrite: false }));
  lidTop.position.y = H + 0.02; disc.add(lidTop);
  const gasket = new THREE.Mesh(new THREE.TorusGeometry(DISC.rOut + 0.025, 0.014, 8, 96), new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.9 }));
  gasket.rotation.x = Math.PI / 2; gasket.position.y = H + 0.008; disc.add(gasket);
  const hubTex = canvasTex(256, 256, (g, W) => {
    g.fillStyle = '#f4f6f8'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 6.3); g.fill();
    g.strokeStyle = '#c3c9d0'; g.lineWidth = 4; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 4, 0, 6.3); g.stroke();
    g.fillStyle = '#2b3138'; g.font = '700 30px Pretendard, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 1; k <= 12; k++) { const a = (k % 12) * (Math.PI / 6); g.fillText(String(k), W / 2 + Math.sin(a) * 96, W / 2 - Math.cos(a) * 96); }
    g.fillStyle = '#f29a3a'; g.beginPath(); g.arc(W / 2, W / 2, 30, 0, 6.3); g.fill();
  }).tex;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(DISC.rIn + 0.01, DISC.rIn + 0.01, 0.04, 48), [M.plastic, new THREE.MeshStandardMaterial({ map: hubTex, roughness: 0.5 }), M.plastic]);
  cap.position.y = H + 0.04; disc.add(cap);
  // 칸 바닥 (클릭·강조 대상)
  for (let k = 1; k <= 12; k++) {
    const clockNo = k % 12;
    const mat = new THREE.MeshPhysicalMaterial({ color: '#f6f8fa', roughness: 0.45, emissive: '#000000' });
    const g = new THREE.ExtrudeGeometry(sectorShape(clockNo), { depth: 0.012, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = 0.001;
    mesh.userData.slot = k;
    const group = new THREE.Group();
    group.add(mesh);
    disc.add(group);
    compartments.set(k, { mesh, mat, clock: clockNo, pills: [], group });
  }
  const shaft = cyl(0.04, 0.04, 0.4, M.alu, 16);
  shaft.position.y = -0.2; disc.add(shaft);
}

/** 투입 모듈: 호퍼(투명 깔때기) → 가공 하우징 + 가이드 레일 + 액추에이터 → 노즐 (약통 위 뚜껑의 투입구로) */
function buildInputModule() {
  const g = new THREE.Group();
  g.position.set(0, 0, FEED_Z);
  scene.add(g);
  const bracket = rbox(0.9, 0.06, 0.36, 0.015, M.alu);
  bracket.position.set(0, 3.86, -0.12); g.add(bracket);
  for (const x of [-0.38, -0.2, 0.2, 0.38]) screw(g, x, 3.892, -0.12, 'y');
  const pts = [new THREE.Vector2(0.05, 0), new THREE.Vector2(0.06, 0.04), new THREE.Vector2(0.15, 0.2), new THREE.Vector2(0.19, 0.3), new THREE.Vector2(0.195, 0.32)];
  const hopper = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), M.clear);
  hopper.position.set(0, 3.52, 0); g.add(hopper);
  const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.012, 8, 48), M.alu);
  hopperRim.rotation.x = Math.PI / 2; hopperRim.position.set(0, 3.84, 0); g.add(hopperRim);
  for (const x of [-0.21, 0.21]) {
    const rail = rbox(0.045, 0.82, 0.045, 0.01, M.aluDark);
    rail.position.set(x, 3.43, -0.14); g.add(rail);
    const block = rbox(0.08, 0.1, 0.08, 0.012, M.alu);
    block.position.set(x, 3.3, -0.12); g.add(block);
  }
  const housing = rbox(0.34, 0.3, 0.26, 0.03, M.alu);
  housing.position.set(0, 3.33, -0.02); g.add(housing);
  const plate = rbox(0.26, 0.22, 0.02, 0.008, M.aluDark);
  plate.position.set(0, 3.33, 0.12); g.add(plate);
  for (const [x, y] of [[-0.1, 3.42], [0.1, 3.42], [-0.1, 3.24], [0.1, 3.24]]) screw(g, x, y, 0.132);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.14, 0.004), new THREE.MeshBasicMaterial({ color: '#1a1d22' }));
  slit.position.set(0.06, 3.33, 0.132); g.add(slit);
  const actuator = cyl(0.05, 0.05, 0.26, M.anod, 20);
  actuator.position.set(-0.27, 3.55, -0.02); g.add(actuator); addEdges(actuator, M.edgeLight, 40);
  const rod = cyl(0.016, 0.016, 0.2, M.alu, 12);
  rod.position.set(-0.27, 3.34, -0.02); g.add(rod);
  const nozzle = cyl(0.07, 0.035, 0.16, M.alu, 24);
  nozzle.position.set(0, 3.1, 0); g.add(nozzle); addEdges(nozzle, M.edge, 40);
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 24), M.anod);
  tip.rotation.x = Math.PI / 2; tip.position.set(0, 3.02, 0); g.add(tip);
  // 노즐 → 약통 뚜껑 투입구 (짧은 투명 관)
  const link = cyl(0.04, 0.04, 3.0 - (BIN_TOP + 0.03), M.clear, 16, true);
  link.position.set(0, (3.0 + BIN_TOP + 0.03) / 2, 0); g.add(link);
}

/** 모터 구동부: 스테퍼 모터 + 기어(톱니) + 벨트 */
function buildMotor() {
  const g = new THREE.Group();
  scene.add(g);
  const gear = cyl(0.17, 0.17, 0.06, M.alu, 48);
  gear.position.set(0, DISC.y - 0.33, DISC.z); g.add(gear);
  for (let i = 0; i < 28; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.035), M.alu);
    const a = (i / 28) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.18, DISC.y - 0.33, DISC.z + Math.sin(a) * 0.18);
    tooth.rotation.y = -a;
    g.add(tooth);
  }
  const motor = rbox(0.28, 0.28, 0.28, 0.03, M.anod);
  motor.position.set(0.42, DISC.y - 0.62, DISC.z - 0.25); g.add(motor);
  const face = rbox(0.3, 0.05, 0.3, 0.01, M.alu);
  face.position.set(0.42, DISC.y - 0.46, DISC.z - 0.25); g.add(face);
  for (const [dx, dz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) screw(g, 0.42 + dx, DISC.y - 0.43, DISC.z - 0.25 + dz, 'y');
  const pulley = cyl(0.06, 0.06, 0.05, M.alu, 24);
  pulley.position.set(0.42, DISC.y - 0.33, DISC.z - 0.25); g.add(pulley);
  const beltMat = new THREE.MeshStandardMaterial({ color: '#1e2126', roughness: 0.8 });
  const from = new THREE.Vector3(0, DISC.y - 0.33, DISC.z), to = new THREE.Vector3(0.42, DISC.y - 0.33, DISC.z - 0.25);
  const dir = to.clone().sub(from), len = dir.length();
  for (const side of [-1, 1]) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.008), beltMat);
    const n = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(side * 0.11);
    belt.position.copy(from.clone().add(to).multiplyScalar(0.5).add(n));
    belt.rotation.y = -Math.atan2(dir.z, dir.x);
    g.add(belt);
  }
}

/** 이송 슈트: 약통 아래 게이트 → 곡선 투명 관(클램프) → 포장 모듈 */
function buildChute() {
  const gate = rbox(0.2, 0.08, 0.2, 0.02, M.anod);
  gate.position.set(0, DISC.y - 0.1, FEED_Z); scene.add(gate);
  chuteCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, DISC.y - 0.14, FEED_Z),
    new THREE.Vector3(0, DISC.y - 0.36, FEED_Z + 0.04),
    new THREE.Vector3(0, NICHE_TOP + 0.24, POUCH_Z - 0.03),
    new THREE.Vector3(0, NICHE_TOP + 0.09, POUCH_Z),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(chuteCurve, 40, 0.055, 20, false), M.clear);
  scene.add(tube);
  for (const t of [0.3, 0.75]) {
    const p = chuteCurve.getPointAt(t), tan = chuteCurve.getTangentAt(t);
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 8, 24), M.alu);
    clamp.position.copy(p);
    clamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    scene.add(clamp);
    const armLen = Math.abs(p.z + 0.78);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, armLen), M.aluDark);
    arm.position.set(p.x, p.y, (p.z - 0.78) / 2);
    scene.add(arm);
  }
}

/** 습도 관리 (저가형, 수동식): 약통 가운데 건조제 카트리지(buildDisc) + 뚜껑 위 습도 센서 보드 + 가스켓.
 *  큰 제습기(펠티어·팬) 대신 — 부품 단가는 docs/습도-관리-설계.md */
function buildHumidity() {
  const g = new THREE.Group();
  g.position.set(0.42, BIN_TOP + 0.045, DISC.z - 0.4);
  scene.add(g);
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.11), new THREE.MeshStandardMaterial({ color: '#1d6b3c', roughness: 0.5 }));
  g.add(pcb); addEdges(pcb);
  const sensor = rbox(0.04, 0.02, 0.04, 0.006, new THREE.MeshStandardMaterial({ color: '#d8dde3', metalness: 0.3, roughness: 0.4 }));
  sensor.position.set(0.03, 0.015, 0); g.add(sensor);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 12), new THREE.MeshBasicMaterial({ color: '#111' }));
  vent.position.set(0.03, 0.026, 0); g.add(vent);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshStandardMaterial({ color: '#4fe3b8', emissive: '#4fe3b8', emissiveIntensity: 2 }));
  led.position.set(-0.05, 0.012, 0.03); g.add(led);
  const conn = rbox(0.05, 0.02, 0.03, 0.005, new THREE.MeshStandardMaterial({ color: '#f2f2f2' }));
  conn.position.set(-0.04, 0.014, -0.03); g.add(conn);
  // 센서 → 제어 보드 가는 선
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.38, BIN_TOP + 0.06, DISC.z - 0.43), new THREE.Vector3(0.6, BIN_TOP + 0.1, -0.5), new THREE.Vector3(0.8, 2.5, -0.52),
  ]), 24, 0.008, 6), new THREE.MeshStandardMaterial({ color: '#2a5fd1' }));
  scene.add(wire);
}

/** 제어 보드 (MCU): 초록 PCB + 칩 + 부품 */
function buildBoard() {
  const g = new THREE.Group();
  g.position.set(0.9, 2.45, -0.62);
  g.rotation.y = -0.5;
  scene.add(g);
  const pcbTex = canvasTex(256, 320, (c, W, H) => {
    c.fillStyle = '#1d6b3c'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d9b45a'; c.lineWidth = 2;
    for (let i = 0; i < 26; i++) { c.beginPath(); const x = 10 + (i * 37) % (W - 20), y = 10 + (i * 61) % (H - 20); c.moveTo(x, y); c.lineTo(x + 30, y); c.lineTo(x + 30, y + 24); c.stroke(); }
    c.fillStyle = '#d9b45a'; for (let i = 0; i < 18; i++) { c.beginPath(); c.arc(16 + i * 13, H - 14, 3, 0, 6.3); c.fill(); }
  }).tex;
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.016), new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.55 }));
  g.add(pcb); addEdges(pcb);
  const chip = rbox(0.14, 0.14, 0.03, 0.006, new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.4 }));
  chip.position.set(0.02, 0.04, 0.02); g.add(chip);
  for (let i = 0; i < 8; i++) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), new THREE.MeshStandardMaterial({ color: i % 2 ? '#2a2d31' : '#8a6a3a' }));
    part.position.set(-0.17 + (i % 4) * 0.11, i < 4 ? 0.22 : -0.16, 0.015); g.add(part);
  }
  const conn = rbox(0.12, 0.05, 0.04, 0.006, new THREE.MeshStandardMaterial({ color: '#f2f2f2' }));
  conn.position.set(-0.12, -0.24, 0.025); g.add(conn);
  const cap = cyl(0.025, 0.025, 0.06, new THREE.MeshStandardMaterial({ color: '#1f3b8a', metalness: 0.4, roughness: 0.35 }), 16);
  cap.rotation.x = Math.PI / 2; cap.position.set(0.16, -0.05, 0.04); g.add(cap);
}

/** 전원 모듈 + 케이블 */
function buildPower() {
  const ventTex = canvasTex(128, 128, (c, W) => { c.fillStyle = '#cfd5dc'; c.fillRect(0, 0, W, W); c.fillStyle = '#6f767e'; for (let i = 0; i < 9; i++) c.fillRect(20, 12 + i * 12, W - 40, 5); }).tex;
  const box = rbox(0.46, 0.56, 0.4, 0.035, new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: ventTex, metalness: 0.6, roughness: 0.38 }));
  box.position.set(0.72, 0.62, -0.42);
  scene.add(box);
  const cable = (pts, color) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, 0.014, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    scene.add(tube);
  };
  cable([[0.6, 0.92, -0.3], [0.62, 1.4, -0.32], [0.75, 1.95, -0.45], [0.82, 2.05, -0.5]], '#c8322b');
  cable([[0.66, 0.92, -0.32], [0.7, 1.45, -0.36], [0.8, 1.92, -0.48], [0.88, 2.04, -0.52]], '#1a1c20');
}

function buildNiche() {
  const z0 = FRONT_Z - NICHE.depth, w = NICHE.w - 0.03, h = NICHE.h - 0.03, top = NICHE_TOP, bot = NICHE.y - h / 2;
  const lining = new THREE.MeshStandardMaterial({ color: '#8a6d4e', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  softMats.push(lining);
  const plane = (pw, ph, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), lining); m.position.copy(pos); m.rotation.set(...rot); scene.add(m); return m; };
  plane(w, h, new THREE.Vector3(0, NICHE.y, z0), [0, 0, 0]);
  // 모서리가 둥근 통로: 바깥은 잘라낸 상자보다 크게(몸체 안에 숨음), 안쪽 구멍이 둥근 사각형
  const tunnelShape = roundedRect(w + 0.24, h + 0.24, 0.1, 0, NICHE.y);
  tunnelShape.holes.push(roundedRect(w, h, NICHE_ROUND, 0, NICHE.y));
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#5a5f67', metalness: 0.62, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.5 });
  shellMats.push(capMat);
  const tunnel = new THREE.Mesh(new THREE.ExtrudeGeometry(tunnelShape, { depth: NICHE.depth, bevelEnabled: false, curveSegments: 16 }), [capMat, lining]);
  tunnel.position.z = z0;
  scene.add(tunnel);
  stripMat = new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: '#ffc77a', emissiveIntensity: 2.2 });
  const strip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.62, 4, 12), stripMat);
  strip.rotation.z = Math.PI / 2; strip.position.set(0, top - 0.06, FRONT_Z - 0.12);
  scene.add(strip);
  const nicheLight = new THREE.PointLight('#ffb36b', 4.2, 2.8, 1.5);
  nicheLight.position.set(0, top - 0.18, FRONT_Z - 0.3);
  scene.add(nicheLight);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: '#120d08' }));
  slot.position.set(0, top - 0.012, POUCH_Z);
  scene.add(slot);
}

/** 포장 카세트 커버: 필름 롤·히터 바를 가리는 탈착식 덮개 (밀봉 열에 손이 닿지 않게). 아래 틈으로 파우치·알약이 나옴 */
function buildSealCover() {
  const top = NICHE_TOP, z0 = FRONT_Z - NICHE.depth;
  const zBack = z0 + 0.015, zFront = FRONT_Z - 0.2, H = 0.36, W = 1.64;
  const coverMat = new THREE.MeshPhysicalMaterial({ color: '#d9dde2', roughness: 0.42, metalness: 0.05, clearcoat: 0.4 });
  shellMats.push(coverMat);
  const g = new THREE.Group();
  scene.add(g);
  const box = rbox(W, H, zFront - zBack, 0.05, coverMat);
  box.position.set(0, top - H / 2 - 0.01, (zBack + zFront) / 2);
  g.add(box);
  const bottom = top - H - 0.01;
  // 위쪽 이음새(분리선)
  const seam = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: '#3a3f46' }));
  seam.position.set(0, top - 0.075, zFront + 0.001); g.add(seam);
  // 아래 배출 틈
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.014, 0.08), new THREE.MeshBasicMaterial({ color: '#0e0b08' }));
  slot.position.set(0, bottom - 0.002, POUCH_Z); g.add(slot);
  // 양쪽 분리 버튼 (누르고 당겨서 빼기)
  const tabMat = new THREE.MeshStandardMaterial({ color: '#3d7be0', roughness: 0.45 });
  for (const x of [-(W / 2 - 0.13), W / 2 - 0.13]) {
    const tab = rbox(0.16, 0.08, 0.03, 0.012, tabMat, false);
    tab.position.set(x, bottom + H * 0.45, zFront + 0.012); g.add(tab);
  }
  // 손잡이 홈
  const grip = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.34, 0.05, 0.025), 8), new THREE.MeshBasicMaterial({ color: '#8d949c' }));
  grip.position.set(0, bottom + 0.05, zFront + 0.002); g.add(grip);
  // 경고 라벨: 고온 주의
  const lab = canvasTex(720, 96, (c, w, h) => {
    c.fillStyle = '#f2a33a'; c.beginPath(); c.roundRect(0, 0, w, h, 18); c.fill();
    c.fillStyle = '#1d1a16'; c.beginPath(); c.moveTo(56, 18); c.lineTo(92, 78); c.lineTo(20, 78); c.closePath(); c.fill();
    c.fillStyle = '#f2a33a'; c.fillRect(53, 38, 6, 22); c.fillRect(53, 65, 6, 6);
    c.fillStyle = '#1d1a16'; c.font = '700 44px Pretendard, "Malgun Gothic", sans-serif'; c.textBaseline = 'middle';
    c.fillText('고온 주의 · 분리형 커버', 112, h / 2 + 2);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.112), new THREE.MeshBasicMaterial({ map: lab.tex, transparent: true }));
  label.position.set(0, bottom + H * 0.5, zFront + 0.003); g.add(label);
  g.userData.parts = [label.material, grip.material, seam.material, slot.material, tabMat];
  sealCover = g;
}

/** 포장 모듈: 필름 롤(영수증처럼 풀려 나옴) + 안내 롤러 + 히터 바 · 컵 장치(바로 먹기 모드) */
function buildSealer() {
  const top = NICHE_TOP, z0 = FRONT_Z - NICHE.depth;
  for (const x of [-0.66, 0.66]) {
    const side = rbox(0.04, 0.3, 0.42, 0.01, M.alu);
    side.position.set(x, top + 0.14, POUCH_Z); scene.add(side);
    screw(scene, x + (x < 0 ? -0.022 : 0.022), top + 0.2, POUCH_Z - 0.1, 'x');
    screw(scene, x + (x < 0 ? -0.022 : 0.022), top + 0.08, POUCH_Z + 0.1, 'x');
  }
  for (const dz of [-0.14, 0.14]) {
    const roller = cyl(0.045, 0.045, 1.28, M.plastic, 24);
    roller.rotation.z = Math.PI / 2; roller.position.set(0, top + 0.1, POUCH_Z + dz); scene.add(roller);
    addEdges(roller, M.edge, 50);
  }
  // 필름 롤: 출구 천장 안쪽 뒤편. 감긴 필름(반투명 흰색) + 종이 심 + 양쪽 받침
  roll = new THREE.Group();
  roll.position.set(0, top - 0.16, z0 + 0.13);
  scene.add(roll);
  const film = cyl(0.11, 0.11, 0.74, new THREE.MeshPhysicalMaterial({ color: '#eef2f6', roughness: 0.25, clearcoat: 0.6, transmission: 0.15, thickness: 0.2 }), 40);
  film.rotation.z = Math.PI / 2; roll.add(film); addEdges(film, M.edge, 60);
  rollCore = cyl(0.04, 0.04, 0.78, new THREE.MeshStandardMaterial({ color: '#b58a5a', roughness: 0.8 }), 20);
  rollCore.rotation.z = Math.PI / 2; roll.add(rollCore);
  for (const x of [-0.42, 0.42]) {
    const holder = rbox(0.04, 0.2, 0.14, 0.01, M.aluDark);
    holder.position.set(x, top - 0.1, z0 + 0.13); scene.add(holder);
  }
  // 롤 → 밀봉 지점까지 이어진 필름 띠
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.7, POUCH_Z - (z0 + 0.24)), new THREE.MeshPhysicalMaterial({ color: '#eef2f6', transparent: true, opacity: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  strip.rotation.x = -Math.PI / 2 + 0.25;
  strip.position.set(0, top - 0.13, (z0 + 0.24 + POUCH_Z) / 2);
  scene.add(strip);
  // 히터 바 2개 (밀봉 때 빛남)
  sealMat = new THREE.MeshStandardMaterial({ color: '#9aa2ab', metalness: 0.8, roughness: 0.35, emissive: '#ff7a2a', emissiveIntensity: 0 });
  sealTop = rbox(0.86, 0.05, 0.06, 0.012, sealMat);
  sealBottom = rbox(0.86, 0.05, 0.06, 0.012, sealMat);
  sealTop.position.set(0, top - 0.08, POUCH_Z + 0.09); sealBottom.position.set(0, top - 0.08, POUCH_Z - 0.09);
  scene.add(sealTop, sealBottom);

  // 컵 (집에서 모드): 받침 퍽 위의 컵이 출구 정면에서 대기하다가 안으로 들어가 약을 받고 다시 나옴
  cup = new THREE.Group();
  const puck = cyl(0.26, 0.28, 0.1, M.aluDark, 48);
  puck.position.y = 0.05; cup.add(puck); addEdges(puck, M.edge, 40);
  const puckTop = cyl(0.25, 0.25, 0.006, new THREE.MeshStandardMaterial({ color: '#2a2e34', roughness: 0.6 }), 48);
  puckTop.position.y = 0.103; cup.add(puckTop);
  const vessel = new THREE.Group();
  vessel.position.y = 0.106;
  vessel.scale.setScalar(1.45);
  cup.add(vessel);
  cup.userData.vessel = vessel;
  const cupMat = new THREE.MeshPhysicalMaterial({ color: '#f7fbff', transparent: true, opacity: 0.62, roughness: 0.18, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.125, 0.01), new THREE.Vector2(0.15, 0.22), new THREE.Vector2(0.155, 0.23)];
  vessel.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), cupMat));
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.153, 0.008, 8, 40), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2 }));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.23; vessel.add(rimRing);
  const foot = cyl(0.125, 0.125, 0.012, new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', roughness: 0.3 }), 40);
  foot.position.y = 0.006; vessel.add(foot);
  const band = cyl(0.142, 0.135, 0.04, new THREE.MeshStandardMaterial({ color: '#7fb8f0', roughness: 0.4, side: THREE.DoubleSide }), 40, true);
  band.position.y = 0.06; vessel.add(band);
  CUP.home.set(0, NICHE_BOT, FRONT_Z - 0.2);
  CUP.fill.set(0, NICHE_BOT, POUCH_Z);
  cup.position.copy(CUP.home);
  scene.add(cup);
}

/* ───── 속 보기 ───── */
const HOME = { pos: new THREE.Vector3(1.5, 5.0, 11.8), target: new THREE.Vector3(0, 1.75, 0) };
const INSIDE = { pos: new THREE.Vector3(2.0, 5.3, 9.6), target: new THREE.Vector3(0, 2.1, 0) }; // 버튼을 누르면 이 자리로 다가감. 너무 확대되지 않게 거리 약 10 (11-21)
const LOADVIEW = { pos: new THREE.Vector3(2.3, 6.4, 9.9), target: new THREE.Vector3(0, 2.85, 0.1) }; // 넣기: 위의 영양제 통과 아래 칸이 함께 보이게
let camFrom = null, camTo = null, savedView = null;
export function setXray(on, ms = 650) {
  const from = xray, to = on ? 1 : 0;
  if (from === to) return Promise.resolve();
  // 카메라: 켤 때는 지금 보던 자리를 기억해 두고 안쪽 자리로, 끌 때는 기억한 자리로
  if (on) { savedView = { pos: camera.position.clone(), target: controls.target.clone() }; camFrom = { ...savedView }; camTo = INSIDE; }
  else { camFrom = { pos: camera.position.clone(), target: controls.target.clone() }; camTo = savedView ?? HOME; }
  [...shellMats, ...softMats].forEach((m) => { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; });
  return tween(ms, (t) => {
    xray = from + (to - from) * t;
    shellMats.forEach((m) => { m.opacity = 1 - xray * 0.88; });
    softMats.forEach((m) => { m.opacity = 1 - xray * 0.75; });
    screenMesh.material.opacity = 1 - xray * 0.9;
    sealCover?.userData.parts.forEach((m) => { m.transparent = true; m.opacity = 1 - xray * 0.88; });
    if (camFrom) { camera.position.lerpVectors(camFrom.pos, camTo.pos, t); controls.target.lerpVectors(camFrom.target, camTo.target, t); }
  }).then(() => {
    camFrom = null;
    if (!on) [...shellMats, ...softMats].forEach((m) => { m.transparent = false; m.depthWrite = true; m.opacity = 1; m.needsUpdate = true; });
  });
}
export function toggleXray() { clearTimeout(xrayTimer); return setXray(xray < 0.5); }
export function isXray() { return xray > 0.5; }

/* ───── 파우치 ───── */
/** 파우치 안 알약 자리: 라벨 아래, 바닥에서 위로 줄을 채움(가운데 정렬). h = 파우치 바닥에서의 높이 */
function pouchLayout(total) {
  const rows = Math.min(3, Math.ceil(total / 4)) || 1;
  const cols = Math.max(1, Math.ceil(total / rows));
  const gap = Math.min(0.14, 0.5 / Math.max(1, cols - 1));
  return Array.from({ length: total }, (_, i) => {
    const r = Math.floor(i / cols), n = Math.min(cols, total - r * cols);
    return { x: ((i % cols) - (n - 1) / 2) * gap, h: 0.085 + r * 0.105 };
  });
}
/** 다 나온 파우치가 놓이는 자리: 아랫단이 출구 바닥 안쪽에 닿고 윗단은 뒤로 기댐 */
function pouchRest() {
  const tilt = -0.3, botY = NICHE_BOT + 0.03, botZ = FRONT_Z - 0.3;
  return { tilt, pos: new THREE.Vector3(0, botY + POUCH.h * Math.cos(tilt), botZ + POUCH.h * Math.sin(tilt)) };
}
/** 파우치 확대: 누르면 카메라가 파우치 앞으로 다가가 라벨·알약이 보이게, 다시 누르면 보던 자리로 */
export function onPouchZoom(fn) { pouchZoomCb = fn; }
export function isPouchZoomed() { return !!pouchZoom; }
export async function zoomPouch(on) {
  if (!!on === !!pouchZoom) return;
  const from = { pos: camera.position.clone(), target: controls.target.clone() };
  let to;
  if (on) {
    if (!currentPouch || busy) return;
    pouchZoom = from;
    const center = currentPouch.localToWorld(new THREE.Vector3(0, -POUCH.h * 0.45, 0));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(currentPouch.quaternion); // 파우치 앞면이 보는 쪽
    to = { target: center, pos: center.clone().addScaledVector(normal, 2.7).add(new THREE.Vector3(0.22, 0.1, 0)) };
    controls.minDistance = 1; // 기본 최소 거리(5)로는 가까이 갈 수 없음
  } else {
    to = pouchZoom; pouchZoom = null;
  }
  pouchZoomCb(!!on);
  await tween(650, (t) => { camera.position.lerpVectors(from.pos, to.pos, t); controls.target.lerpVectors(from.target, to.target, t); });
  if (!on) controls.minDistance = 5;
}

/* ───── 시나리오 초기화 ───── */
/** 기기를 처음 상태로: 확대·알람·칸 강조를 끄고, 출구의 파우치·컵 속 알약을 치우고, 컵 모드로, 속 보기 끄고, 카메라 처음 자리로 */
export function reset() {
  return hold(async () => {
    clearTimeout(xrayTimer);
    if (pouchZoom) await zoomPouch(false);
    setUI({ alarm: null, active: null, done: false, pills: [], progress: 0, status: '준비됨' });
    glowSlot(null);
    await clearPouch();
    if (cupPills.length) { for (const p of cupPills) cup.userData.vessel.remove(p); cupPills = []; }
    if (outing) { outing = false; setUI({ outing }); modeCb(false); }
    if (!cup.visible) await showCup(); else cup.position.copy(CUP.home);
    await setXray(false);
    savedView = null;
    const from = { pos: camera.position.clone(), target: controls.target.clone() };
    await tween(600, (t) => { camera.position.lerpVectors(from.pos, HOME.pos, t); controls.target.lerpVectors(from.target, HOME.target, t); });
  });
}

/* ───── 복용 알람 ───── */
/** a: { memberId, title, round, roundName, time } | null. 켜지면 뚜껑 링·화면이 주황으로 깜빡이고, 그 사람 버튼을 누르면 배출 */
export function setAlarm(a) { setUI({ alarm: a ? { memberId: a.memberId, title: a.title, roundName: a.roundName, time: a.time } : null }); }

/** 출구에 남은 파우치를 앞으로 꺼내며 사라지게 (다음 배출 또는 컵 모드로 바꿀 때) */
async function clearPouch() {
  if (pouchZoom) await zoomPouch(false);
  if (!currentPouch) return;
  const old = currentPouch; currentPouch = null;
  const mats = [];
  old.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; mats.push([o.material, o.material.opacity]); } });
  const z = old.position.z;
  await tween(350, (t) => { old.position.z = z + t * 0.9; for (const [m, a] of mats) m.opacity = a * (1 - t); });
  scene.remove(old);
}

/* ───── 모드 (외출 모드 = 파우치 밀봉 / 끄면 컵) ───── */
export function isOuting() { return outing; }
export function onModeChange(fn) { modeCb = fn; }
/** 외출 모드: 켜면 컵이 바닥으로 사라지고 파우치 포장, 끄면 컵이 출구 정면에 다시 나타남 */
export async function setOuting(on) {
  if (busy || outing === !!on) return;
  outing = !!on;
  setUI({ outing });
  modeCb(outing);
  if (outing) await hideCup(); else { await clearPouch(); await showCup(); }
}
async function hideCup() {
  if (!cup.visible) return;
  const s0 = cup.scale.x;
  await tween(450, (t) => { const k = Math.max(0.01, s0 * (1 - t)); cup.scale.set(k, k, k); });
  cup.visible = false;
  for (const p of cupPills) cup.userData.vessel.remove(p);
  cupPills = [];
}
async function showCup() {
  cup.position.copy(CUP.home);
  cup.scale.setScalar(0.01);
  cup.visible = true;
  await tween(450, (t) => { const k = Math.max(0.01, t); cup.scale.set(k, k, k); });
}
async function moveCup(to, ms = 650) {
  const from = cup.position.clone();
  await tween(ms, (t) => { cup.position.lerpVectors(from, to, t); });
}

/* ───── 상태 → 화면 ───── */
export function setMembers(list) { members = list.map((m) => ({ id: m.id, title: m.title })); drawScreen(); }
export function onSlotClick(fn) { slotClickCb = fn; }
export function onMemberClick(fn) { memberClickCb = fn; }
/** 오늘 가족 복용 진행 { total, done, next: { title, round } | null } — 기다릴 때 화면 링에 표시 */
export function setToday(today) { setUI({ today }); }
function flashMember(id) { setUI({ active: id }); setTimeout(() => { if (!busy) setUI({ active: null }); }, 1200); }

export function updateSlots(slots, productList) {
  if (productList) products = new Map(productList.map((p) => [p.id, p]));
  for (const s of slots) {
    const c = compartments.get(s.slot);
    if (!c) continue;
    const p = products.get(s.productId);
    c.mat.color.set('#f6f8fa'); // 서늘 구역 없음(11-21): 12칸 모두 같은 색
    for (const pill of c.pills) c.group.remove(pill);
    c.pills = [];
    if (!p) continue;
    const n = slotCount(s.remaining);
    for (let i = 0; i < n; i++) {
      const pill = pillMesh(p.color, p.form);
      const pose = slotPillPose(c, i);
      pill.position.copy(pose.pos);
      pill.rotation.y = pose.rotY;
      c.group.add(pill);
      c.pills.push(pill);
    }
  }
  const hs = slots.filter((s) => s.productId && typeof s.humidity === 'number').map((s) => s.humidity);
  if (hs.length) ui.humid = Math.round(hs.reduce((a, b) => a + b, 0) / hs.length);
  if (desiccantMat) desiccantMat.color.set(ui.humid != null && ui.humid >= 50 ? '#3f9b5a' : '#f29a3a');
  const filled = slots.filter((s) => s.productId).map((s) => products.get(s.productId)).filter(Boolean);
  if (!busy) setUI({ status: `준비됨, ${filled.length}칸 사용 중` });
}

function glowSlot(n) {
  for (const [k, c] of compartments) {
    c.mat.emissive.set(k === n ? '#3d7bff' : '#000000');
    c.mat.emissiveIntensity = k === n ? 0.8 : 0;
  }
}
export function highlightSlot(n) {
  glowSlot(n);
  if (n != null && !busy) {
    setXray(true);
    clearTimeout(xrayTimer);
    xrayTimer = setTimeout(() => { if (!busy) { setXray(false); glowSlot(null); } }, 3500);
  }
}

/* ───── 동작 ───── */
export async function rotateTo(n) {
  const target = THREE.MathUtils.degToRad((n % 12) * 30 - 180);
  let delta = target - discAngle;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  const from = discAngle;
  await tween(750, (t) => { disc.rotation.y = from + delta * t; });
  discAngle = from + delta;
}

async function hold(fn) {
  busy = true;
  clearTimeout(xrayTimer);
  try { return await fn(); } finally { busy = false; }
}
export function isBusy() { return busy; }

/** 넣기 장면용 영양제 통(11-23): 흰 플라스틱 통 + 제품 색 뚜껑 + 이름 라벨. 그룹 원점 = 통 입구(기울일 때 축) */
function makeBottle(p) {
  const g = new THREE.Group();
  const prof = [[0, -0.8], [0.2, -0.8], [0.235, -0.775], [0.24, -0.72], [0.24, -0.24], [0.21, -0.16], [0.12, -0.09], [0.1, -0.07], [0.1, 0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshPhysicalMaterial({ color: '#f7f8fa', roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide }));
  g.add(body);
  const name = (p.name ?? '영양제').replace(/\(.*?\)/g, '').trim();
  const label = canvasTex(512, 180, (c, W, H) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.fillStyle = p.color; c.fillRect(0, 0, W, 46); c.fillRect(0, H - 22, W, 22);
    c.fillStyle = '#2b3138'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${name.length > 9 ? 34 : 42}px Pretendard, system-ui, sans-serif`;
    c.fillText(name, W / 2, 98);
    c.font = '500 22px Pretendard, system-ui, sans-serif'; c.fillStyle = '#6b7280';
    c.fillText(`${p.form ?? '정'} · 가상 제품`, W / 2, 138);
  }).tex;
  // u=0.5(글자 가운데)가 앞(+z)을 보게 thetaStart = π
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.243, 0.243, 0.36, 48, 1, true, Math.PI), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }));
  wrap.position.y = -0.48; g.add(wrap);
  const capMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(p.color).multiplyScalar(0.85), roughness: 0.4, clearcoat: 0.4 });
  const cap = new THREE.Group();
  const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.11, 32), capMat);
  capBody.position.y = 0.045; cap.add(capBody);
  for (let k = 0; k < 16; k++) { // 뚜껑 홈
    const a = (k / 16) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), capMat);
    rib.position.set(0.119 * Math.sin(a), 0.045, 0.119 * Math.cos(a)); cap.add(rib);
  }
  g.add(cap);
  return { g, cap };
}

/** 투입: 영양제 통이 기기 위로 와서 뚜껑이 돌려 열리고 → 기울어져 알약이 호퍼로 쏟아짐 → 알약이 노즐을 지나 칸에 차례로 쌓임 (11-23)
 *  집에서 먹던 영양제를 기계로 옮기는 장면. remaining: 새 칸 잔량(앱이 정함). 그만큼(slotCount) 붓고, 떨어진 자리는 updateSlots와 같다 */
export function load(productId, n, remaining = 30) {
  return hold(async () => {
    const p = products.get(productId) ?? { color: '#7FB8E6', form: '캡슐', name: '영양제' };
    const capsule = p.form === '캡슐';
    if (pouchZoom) await zoomPouch(false);
    setUI({ status: `${n}번 칸에 넣는 중`, done: false });
    const TOP = BODY_H + BEVEL;
    const { g: bottle, cap } = makeBottle(p);
    const rest = new THREE.Vector3(0.78, TOP + 0.95, FEED_Z);   // 통이 서 있는 자리(입구 기준)
    const pourAt = new THREE.Vector3(0.14, TOP + 0.24, FEED_Z); // 기울였을 때 입구 자리: 열린 덮개 위, 호퍼 바로 위
    bottle.position.copy(rest).add(new THREE.Vector3(0, 0.7, 0));
    bottle.scale.setScalar(0.01);
    scene.add(bottle);

    // 1) 속 보기 + 카메라는 통까지 보이게, 덮개 열림, 빈 칸을 앞으로, 통이 내려옴
    const xr = setXray(true); camTo = LOADVIEW;
    const enter = bottle.position.clone();
    await Promise.all([
      xr,
      tween(450, (t) => { hinge.rotation.x = -1.05 * t; }),
      rotateTo(n).then(() => glowSlot(n)),
      tween(600, (t) => { bottle.position.lerpVectors(enter, rest, t); bottle.scale.setScalar(Math.max(0.01, t)); }),
    ]);

    // 2) 뚜껑을 돌려 열고 옆으로 치움
    await tween(520, (t) => { cap.rotation.y = -t * Math.PI * 3; cap.position.y = t * 0.1; });
    const capFrom = cap.position.clone();
    await tween(280, (t) => { cap.position.set(capFrom.x + t * 0.3, capFrom.y + t * 0.15, capFrom.z); cap.scale.setScalar(Math.max(0.01, 1 - t)); });
    cap.visible = false;

    // 3) 통이 호퍼 위로 와서 기울어짐 (입구가 왼쪽 아래를 봄)
    const tilt = 2.05;
    await tween(650, (t) => { bottle.position.lerpVectors(rest, pourAt, t); bottle.rotation.z = tilt * t; });

    // 4) 알약이 입구에서 쏟아져 호퍼 → 노즐 → 칸으로, 차례로 쌓임. 붓는 동안 통이 살짝 흔들림
    const c = compartments.get(n);
    for (const old of c.pills) c.group.remove(old);
    c.pills = [];
    disc.updateMatrixWorld(true); bottle.updateMatrixWorld(true);
    const mouth = bottle.localToWorld(new THREE.Vector3(0, 0.03, 0));
    const out = bottle.localToWorld(new THREE.Vector3(0, 0.2, 0));
    const total = slotCount(remaining);
    let shaking = true;
    const shake = (async () => { const t0 = performance.now(); while (shaking) { bottle.rotation.z = tilt + Math.sin((performance.now() - t0) / 70) * 0.04; await new Promise((r) => requestAnimationFrame(r)); } bottle.rotation.z = tilt; })();
    const falling = Promise.all(Array.from({ length: total }, (_, i) => wait(i * 60).then(async () => {
      const pose = slotPillPose(c, i);
      const land = c.group.localToWorld(pose.pos.clone());
      const j = ((i % 3) - 1) * 0.02;
      const path = new THREE.CatmullRomCurve3([
        mouth.clone().add(new THREE.Vector3(0, 0, j)), new THREE.Vector3((out.x + 0.02) * 0.5, out.y - 0.05, FEED_Z + j),
        new THREE.Vector3(0, 3.86, FEED_Z), new THREE.Vector3(0, 3.6, FEED_Z), new THREE.Vector3(0, 3.33, FEED_Z),
        new THREE.Vector3(0, 3.0, FEED_Z), new THREE.Vector3(0, BIN_TOP + 0.02, FEED_Z),
        new THREE.Vector3(land.x, DISC.y + 0.32, land.z), land,
      ]);
      const pill = pillMesh(p.color, p.form, 1);
      pill.rotation.y = pose.rotY;
      pill.position.copy(path.getPointAt(0)); // 장면에 넣기 전에 시작 자리로: 안 그러면 첫 프레임에 원점(출구 아래 몸체 속)에 한 번 보임
      scene.add(pill);
      await tween(1000, (t) => { pill.position.copy(path.getPointAt(t)); });
      c.group.attach(pill);
      pill.position.copy(pose.pos);
      pill.rotation.set(0, pose.rotY, capsule ? Math.PI / 2 : 0); // updateSlots와 같은 자세
      c.pills.push(pill);
    })));
    await wait((total - 1) * 60 + 250); // 마지막 알약이 입구를 떠나면 바로 통을 세움 (칸에 떨어지는 건 계속)
    shaking = false; await shake;

    // 5) 통을 세우고 위로 치움, 덮개 닫힘, 남은 알약이 칸에 마저 쌓임
    const back = bottle.position.clone();
    await Promise.all([
      falling,
      tween(600, (t) => { bottle.rotation.z = tilt * (1 - t); bottle.position.lerpVectors(back, rest.clone().add(new THREE.Vector3(0, 0.5, 0)), t); bottle.scale.setScalar(Math.max(0.01, 1 - t * t)); }),
      wait(350).then(() => tween(450, (t) => { hinge.rotation.x = -1.05 * (1 - t); })),
    ]);
    scene.remove(bottle);
    await wait(300);
    glowSlot(null);
    await setXray(false);
    setUI({ status: `${n}번 칸에 넣었어요` });
  });
}

/** items: [{ slot, count, color, form, name }], label: "아빠 · 11/21 1회차", lines: 내용물
 *  외출 모드: 필름 롤이 영수증처럼 풀려 파우치가 점점 내려오고, 알약이 담기면 밀봉 → 잘려서 앞으로
 *  기본(바로 먹기): 오른쪽 벽에서 컵이 들어와 알약을 받고, 꺼내기 쉽게 앞으로 */
export function dispense(items, label, lines = []) {
  return hold(async () => {
    const total = items.reduce((s, it) => s + it.count, 0) || 1;
    const memberTitle = label.split('·')[0].trim();
    const pouchMode = outing;
    setUI({ alarm: null, status: `${label} ${pouchMode ? '포장' : '배출'} 중`, progress: 0, done: false, pills: items.flatMap((it) => Array(it.count).fill({ color: it.color, form: it.form })), active: members.find((m) => m.title === memberTitle)?.id ?? null });
    // 지난번 결과 정리
    await clearPouch();
    if (cupPills.length) { for (const p of cupPills) cup.userData.vessel.remove(p); cupPills = []; }

    const top = NICHE_TOP;
    let pouch = null, film = null, layout = null;
    if (pouchMode) {
      await hideCup();
      // 파우치 = 묶음(크기 고정) + 필름(위쪽이 기준점, 롤에서 풀려 아래로 길어짐). 알약·라벨은 묶음에 붙여 필름 늘림에 찌그러지지 않게
      const geo = new THREE.BoxGeometry(POUCH.w, POUCH.h, POUCH.d);
      geo.translate(0, -POUCH.h / 2, 0);
      film = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#e9eef3', transparent: true, opacity: 0.42, roughness: 0.32, clearcoat: 0.6, side: THREE.DoubleSide, depthWrite: false })); // 반투명 필름 너머로 알약 색이 보이게
      film.scale.y = 0.05;
      pouch = new THREE.Group();
      pouch.add(film);
      pouch.position.set(0, top - 0.05, POUCH_Z);
      scene.add(pouch);
      layout = pouchLayout(total);
    } else {
      // 출구 정면에서 대기하던 컵이 안으로 들어가 슈트 아래에 섬
      if (!cup.visible) await showCup();
      await moveCup(CUP.fill);
    }
    await setXray(true);

    let done = 0;
    const inPouch = [];
    for (const it of items) {
      await rotateTo(it.slot);
      glowSlot(it.slot);
      const c = compartments.get(it.slot);
      for (let i = 0; i < it.count; i++) {
        const pill = pillMesh(it.color, it.form, 1.2);
        const enter = new THREE.Vector3(0, DISC.y + 0.04, FEED_Z);
        pill.position.copy(enter); // 장면에 넣기 전에 칸 아래 자리로: 안 그러면 첫 프레임에 원점(출구 아래 몸체 속)에 알약이 깜빡 보임
        scene.add(pill);
        await tween(220, (t) => { pill.position.lerpVectors(enter, chuteCurve.getPointAt(0), t); });
        await tween(520, (t) => { pill.position.copy(chuteCurve.getPointAt(t)); });
        const exit = chuteCurve.getPointAt(1);
        if (pouchMode) {
          // 롤이 돌며 필름이 풀려 파우치가 조금 더 내려옴 (영수증처럼). 먼저 담긴 알약은 바닥과 함께 내려감
          const from = film.scale.y, to = 0.25 + 0.75 * ((done + 1) / total);
          const spot = layout[inPouch.length];
          const end = new THREE.Vector3(spot.x, pouch.position.y - POUCH.h * to + spot.h, pouch.position.z);
          // 파우치 면에 맞춰 세움: 두께가 얇은 쪽이 앞을 보게 (파우치 밖으로 튀어나오지 않게)
          const capsule = it.form === '캡슐';
          const q0 = pill.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(capsule ? 0 : Math.PI / 2, 0, capsule ? Math.PI / 2 : 0));
          await tween(380, (t) => {
            film.scale.y = from + (to - from) * t;
            for (const p of inPouch) p.position.y = -POUCH.h * film.scale.y + p.userData.h;
            roll.rotation.x -= 0.12;
            pill.position.lerpVectors(exit, end, t * t);
            pill.quaternion.slerpQuaternions(q0, q1, t);
          });
          pouch.attach(pill);
          pill.position.set(spot.x, -POUCH.h * to + spot.h, 0);
          if (capsule) pill.scale.z *= 0.5; // 캡슐 지름이 파우치 두께보다 커서 눌린 모양으로
          pill.userData.h = spot.h;
          inPouch.push(pill);
        } else {
          // 컵 바닥으로 떨어짐 (중력처럼 점점 빨리) + 살짝 튐
          const n = cupPills.length;
          const local = new THREE.Vector3(((n % 3) - 1) * 0.045, 0.03 + Math.floor(n / 3) * 0.025, ((n * 7) % 3 - 1) * 0.03);
          const end = cup.userData.vessel.localToWorld(local.clone());
          await tween(420, (t) => { pill.position.lerpVectors(exit, end, t * t); });
          await tween(120, (t) => { pill.position.y = end.y + Math.sin(t * Math.PI) * 0.04; });
          cup.userData.vessel.attach(pill);
          cupPills.push(pill);
        }
        const last = c?.pills.pop();
        if (last) c.group.remove(last);
        done++;
        setUI({ progress: done / total });
      }
      glowSlot(null);
      await wait(120);
    }
    await setXray(false);

    if (pouchMode) {
      // 열 밀봉: 히터 바가 파우치 윗부분을 집고 빛남
      const rest = { a: sealTop.position.z, b: sealBottom.position.z };
      await tween(240, (t) => { sealTop.position.z = rest.a - 0.06 * t; sealBottom.position.z = rest.b + 0.06 * t; });
      await tween(500, (t) => { sealMat.emissiveIntensity = Math.sin(t * Math.PI) * 2.5; stripMat.emissiveIntensity = 2.2 + Math.sin(t * Math.PI) * 1.5; });
      await tween(240, (t) => { sealTop.position.z = rest.a - 0.06 * (1 - t); sealBottom.position.z = rest.b + 0.06 * (1 - t); });
      // 라벨 인쇄
      const tex = canvasTex(560, 220, (g, W, H) => {
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 22); g.fill();
        g.fillStyle = '#1d2a3a'; g.font = '700 46px "Pretendard Variable", Pretendard, sans-serif'; g.fillText(label, 28, 74);
        g.font = '500 28px "Pretendard Variable", Pretendard, sans-serif'; g.fillStyle = '#4a5585';
        g.fillText(lines.slice(0, 2).join(', '), 28, 132, W - 56);
        if (lines.length > 2) g.fillText(lines.slice(2, 4).join(', '), 28, 176, W - 56);
      }).tex;
      const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      labelMesh.position.set(0, POUCH.labelY, POUCH.d / 2 + 0.002);
      pouch.add(labelMesh);
      // 잘려서 앞으로 나옴 (영수증 끝처럼 내려오다 출구 바닥 안쪽에 기대 섬 — 출구 턱에 걸리거나 아래로 삐져나오지 않게)
      const from = pouch.position.clone();
      await tween(500, (t) => { pouch.position.y = from.y - 0.12 * t; roll.rotation.x -= 0.15; });
      const mid = pouch.position.clone(), pose = pouchRest();
      await tween(650, (t) => { pouch.position.lerpVectors(mid, pose.pos, t); pouch.rotation.x = pose.tilt * t; });
      currentPouch = pouch;
      setUI({ status: `${label} 밀봉 완료`, progress: 1, done: true });
    } else {
      // 약을 받은 컵이 다시 출구 정면으로 (꺼내 바로 먹을 수 있게)
      await moveCup(CUP.home);
      setUI({ status: `${label} 컵에 담았어요`, progress: 1, done: true });
    }
    setTimeout(() => { if (!busy) setUI({ active: null, done: false, pills: [], progress: 0 }); }, 4000);
    return pouchMode ? 'pouch' : 'cup';
  });
}
