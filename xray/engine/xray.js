// X-Ray My Home engine (Happy Pipes Plumbing, Heating & Air).
// Photo -> scan -> see-through shell -> insides running -> explore in 3D.
// Framework-free ES module. The host page gives it a container, a photo (Blob, File or URL) and the photo analysis
// (see normalizeAnalysis). It knows nothing about Home Portal, so any page can mount it.
//
// Pieces reused from the 3D Equipment Checklist engine (electric_tank_water_heater/viewer/inspector3d.js):
// the touch orbit, the cloned-material fade, tap-to-part raycasting and the clip rules (clip X plays once and holds,
// X_loop runs while it is open). The models are the live packed house GLBs (meshopt), copied, never edited.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as FIT from './fit.js';

export const VERSION = '0.1.0';

// ------------------------------------------------------------------ analysis -> model choice
const FACING_DEG = { toward_camera: 0, toward_camera_left: -35, toward_camera_right: 35, left: -80, right: 80, away: 180 };
const ELEV_DEG = { looking_down: 24, level: 6, looking_up: -10 };
const PHONE_LONG_FOV = 67;                     // typical phone main camera, degrees across the long side
// fit thresholds, tuned on the test set (tools/out, docs/TESTING.md); all must pass to draw over the photo
export const FIT_GOOD = 0.5;           // overall shape score
export const FIT_EDGE_MIN = 0.4;       // share of the outline on a photo edge
export const FIT_SIDE_EDGE_MIN = 0.4;  // the weaker long side on a vertical edge (0.5 failed a dim but correct attic fit)
export const FIT_CAP_MIN = 0.4;        // the top or bottom on a horizontal edge
export const FIT_MIDDLE_MAX = 0.08;    // vertical edges through the middle (pipes, posts, a side of the real tank)

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : raw;
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const conf = a.confidence || {};
  const lvl = v => pick(v, ['high', 'medium', 'low'], 'low');
  let box = null;
  const b = a.box || a.bbox;
  if (b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 5 && b.h > 5) {
    const c = v => Math.max(0, Math.min(1000, v));
    box = { x: c(b.x) / 1000, y: c(b.y) / 1000, w: Math.min(c(b.w), 1000 - c(b.x)) / 1000, h: Math.min(c(b.h), 1000 - c(b.y)) / 1000 };
  }
  let off = Number(a.front_marker_offset);
  // the AI places a point in the picture better than it judges a ratio: when it gives the front marker's x
  // (thousandths of the image width) and a box, work the offset out from those
  const fx = Number(a.front_marker_x), bb = a.box || a.bbox;
  if (a.front_marker_seen !== false && Number.isFinite(fx) && fx > 0 && bb && bb.w > 5) off = (fx - (bb.x + bb.w / 2)) / (bb.w / 2);
  return {
    category: String(a.category || 'none'),
    subtype: pick(a.subtype, ['gas', 'electric', 'hybrid', 'unknown'], 'unknown'),
    orientation: pick(a.orientation, ['upright', 'lying_horizontal', 'wall_hung', 'ceiling_hung', 'unknown'], 'unknown'),
    facing: pick(a.facing, Object.keys(FACING_DEG).concat('unclear'), 'unclear'),
    front_marker_offset: Number.isFinite(off) ? Math.max(-1, Math.min(1, off)) : null,
    camera_height: pick(a.camera_height, Object.keys(ELEV_DEG), 'level'),
    box,
    full_unit_visible: a.full_unit_visible !== false,
    obstruction: pick(a.obstruction, ['clear', 'partly', 'mostly'], 'clear'),
    units_count: Number.isFinite(+a.units_count) ? +a.units_count : 1,
    photo_quality: String(a.photo_quality || 'good'),
    confidence: { category: lvl(conf.category), subtype: lvl(conf.subtype), orientation: lvl(conf.orientation), facing: lvl(conf.facing) },
    label: a.label || '',
  };
}

// mode: 'overlay' (line up over the photo, still subject to the fit check), 'typical' (3D only, labelled typical),
// 'none' (no X-ray offered). reason says why, in a word the host can show or log.
export function pickModel(catalog, A) {
  if (!A || !A.category || A.category === 'none' || A.category === 'other') return { mode: 'none', reason: 'not_supported' };
  if (A.confidence.category === 'low') return { mode: 'none', reason: 'unsure_what_it_is' };
  const models = Object.entries(catalog.models || {});
  const sameCat = models.filter(([, m]) => m.match.category.includes(A.category));
  const typ = (catalog.typical_only || {})[A.category];
  if (!sameCat.length && !typ) return { mode: 'none', reason: 'not_supported' };
  const sub = A.confidence.subtype === 'low' ? 'unknown' : A.subtype;
  const exact = sameCat.find(([, m]) => sub !== 'unknown' && m.match.subtype.includes(sub) && m.match.orientation.includes(A.orientation));
  if (exact && A.confidence.orientation !== 'low' && A.box && A.full_unit_visible && A.obstruction !== 'mostly' && A.units_count <= 3)
    return { mode: 'overlay', key: exact[0], reason: 'matched' };
  const key = (typ && typ.fallback_model && (typ.fallback_model[sub] || typ.fallback_model.unknown)) || (sameCat[0] && sameCat[0][0]);
  if (!key) return { mode: 'none', reason: 'not_supported' };
  let reason = 'no_box';
  if (!exact) reason = A.orientation !== 'upright' ? 'orientation_not_modelled' : 'type_unsure';
  else if (A.confidence.orientation === 'low') reason = 'orientation_unsure';
  else if (!A.full_unit_visible) reason = 'not_fully_visible';
  else if (A.obstruction === 'mostly') reason = 'blocked';
  else if (A.units_count > 3) reason = 'too_many_units';
  return { mode: 'typical', key, reason };
}

export function yawFor(A) {
  if (!A) return 0;
  const f = A.facing;
  if ((f === 'toward_camera' || f === 'toward_camera_left' || f === 'toward_camera_right') && A.front_marker_offset != null && A.confidence.facing !== 'low')
    return Math.asin(Math.max(-0.95, Math.min(0.95, A.front_marker_offset)));
  return THREE.MathUtils.degToRad(FACING_DEG[f] != null ? FACING_DEG[f] : 0);
}

// ------------------------------------------------------------------ shaders
function ghostMaterial(color, rim, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: alpha },
      uTime: { value: 0 }, uRevealY: { value: 0 }, uRevealOn: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vWy;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWy = wp.y; vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha; uniform float uTime; uniform float uRevealY; uniform float uRevealOn;
      varying vec3 vN; varying vec3 vV; varying float vWy;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = f * f;
        float band = 0.5 + 0.5 * sin(vWy * 70.0 - uTime * 3.0);
        float a = uAlpha * (0.12 + 0.88 * f) * (0.82 + 0.18 * band);
        vec3 col = mix(uColor, uRim, f);
        if (uRevealOn > 0.5) {
          float dy = gl_FragCoord.y - uRevealY;
          if (dy < 0.0) discard;
          float edge = 1.0 - smoothstep(0.0, 18.0, dy);
          col += uRim * edge * 1.5; a += edge * 0.5;
        }
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
function waterMaterial(yMin, yMax, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { uYMin: { value: yMin }, uYMax: { value: yMax }, uHeat: { value: 0 }, uAlpha: { value: alpha }, uTime: { value: 0 } },
    vertexShader: `varying float vWy; varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWy = wp.y; vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uYMin; uniform float uYMax; uniform float uHeat; uniform float uAlpha; uniform float uTime;
      varying float vWy; varying vec3 vN; varying vec3 vV;
      void main(){
        float t = clamp((vWy - uYMin) / max(0.001, uYMax - uYMin), 0.0, 1.0);
        float front = 1.0 - uHeat;
        float hot = smoothstep(front - 0.18, front + 0.18, t);
        vec3 cold = vec3(0.16, 0.48, 0.95), warm = vec3(1.0, 0.38, 0.14);
        vec3 col = mix(cold, warm, hot);
        col += 0.06 * sin(vWy * 40.0 - uTime * 2.0);
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(col, uAlpha * (0.6 + 0.4 * f));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ touch orbit (from inspector3d.js)
function Orbit(camera, dom) {
  const self = { target: new THREE.Vector3(0, 0.75, 0), minD: 0.6, maxD: 8, enabled: false };
  const sph = new THREE.Spherical(); let drag = null; const touches = {}; let pinch0 = 0;
  const sync = () => sph.setFromVector3(camera.position.clone().sub(self.target));
  const apply = () => {
    sph.phi = Math.max(0.15, Math.min(Math.PI - 0.15, sph.phi)); sph.radius = Math.max(self.minD, Math.min(self.maxD, sph.radius));
    camera.position.copy(self.target).add(new THREE.Vector3().setFromSpherical(sph)); camera.lookAt(self.target);
  };
  const rotate = (dx, dy) => { sph.theta -= dx * 0.007; sph.phi -= dy * 0.007; apply(); };
  const pan = (dx, dy) => {
    const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), k = sph.radius * 0.0012;
    self.target.add(r.multiplyScalar(-dx * k)).add(u.multiplyScalar(dy * k)); apply();
  };
  const zoom = f => { sph.radius *= f; apply(); };
  dom.addEventListener('pointerdown', e => { if (!self.enabled) return; touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    drag = { x: e.clientX, y: e.clientY, b: e.button }; const t = Object.values(touches); if (t.length === 2) pinch0 = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y); });
  dom.addEventListener('pointermove', e => { if (!self.enabled || !drag || !(e.pointerId in touches)) return;
    touches[e.pointerId] = { x: e.clientX, y: e.clientY }; const t = Object.values(touches);
    if (t.length >= 2) { const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y); if (pinch0) zoom(pinch0 / d); pinch0 = d;
      const cx = (t[0].x + t[1].x) / 2, cy = (t[0].y + t[1].y) / 2; if (drag.cx != null) pan(cx - drag.cx, cy - drag.cy); drag.cx = cx; drag.cy = cy; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.b === 2 || e.shiftKey) pan(dx, dy); else rotate(dx, dy); });
  const up = e => { delete touches[e.pointerId]; if (!Object.keys(touches).length) drag = null; pinch0 = 0; };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', e => { if (!self.enabled) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  self.set = (pos, tgt) => { camera.position.copy(pos); self.target.copy(tgt); camera.lookAt(tgt); sync(); };
  self.sync = sync;
  return self;
}

// ------------------------------------------------------------------ styles
const CSS = `
.xr{position:relative;overflow:hidden;background:#0b1419;color:#eaf6fa;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
.xr *{box-sizing:border-box}
.xr-photo{position:absolute;pointer-events:none;transition:opacity .6s}
.xr-dim{position:absolute;background:#04121a;opacity:0;pointer-events:none;transition:opacity .8s}
.xr canvas.xr-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.xr-scan{position:absolute;pointer-events:none}
.xr-top{position:absolute;left:0;right:0;top:var(--xr-inset-top,0px);padding:10px max(12px,env(safe-area-inset-left)) 0;display:flex;gap:8px;align-items:flex-start;justify-content:space-between;pointer-events:none}
.xr-brand{font:700 12px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#7fe3ff;background:rgba(4,18,26,.62);padding:7px 9px;border-radius:6px}
.xr-found{font:600 12px/1 system-ui;background:rgba(4,18,26,.62);padding:7px 9px;border-radius:6px;color:#cfeef7}
.xr-note{position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--xr-inset-top,0px) + 44px);width:min(92%,560px);text-align:center;font-size:12.5px;color:#cfe3ea;background:rgba(4,18,26,.62);padding:6px 10px;border-radius:6px;pointer-events:none}
.xr-say{align-self:center;width:min(100%,560px);min-height:2.9em;font-size:14.5px;line-height:1.35;color:#d9f4fb;text-align:center;opacity:0;transition:opacity .4s;pointer-events:none}
.xr-say.on{opacity:1}
.xr-bar{position:absolute;left:0;right:0;bottom:0;padding:8px max(10px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:7px;background:#0b1419}
.xr-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}
.xr button{font:600 14px/1 system-ui;color:#eaf6fa;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;min-height:40px;padding:0 14px;cursor:pointer}
.xr button:focus-visible{outline:2px solid #7fe3ff;outline-offset:2px}
.xr button.on{background:#1aa6c9;border-color:#1aa6c9;color:#03141b}
.xr button.go{background:#ffb347;border-color:#ffb347;color:#2a1600}
.xr-seg{display:inline-flex;border:1px solid rgba(255,255,255,.22);border-radius:999px;overflow:hidden}
.xr-seg button{border:0;border-radius:0;min-height:40px}
.xr-card{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--xr-bar,150px) + 8px);width:min(92%,460px);background:#f4fbfd;color:#0c2630;border-radius:12px;padding:12px 14px 12px;box-shadow:0 8px 30px rgba(0,0,0,.4);display:none}
.xr-card.on{display:block}
.xr-card h4{margin:0 0 4px;font:700 16px/1.2 system-ui}
.xr-card p{margin:0;font-size:14.5px}
.xr-card .x{position:absolute;right:6px;top:6px;min-height:30px;padding:0 10px;background:#dfeff4;color:#0c2630;border:0}
.xr-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:rgba(4,18,26,.55);font-weight:600;text-align:center;padding:20px}
.xr-wait .bar{width:160px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden}
.xr-wait .bar i{display:block;height:100%;width:40%;background:#7fe3ff;animation:xrbar 1.1s ease-in-out infinite alternate}
@keyframes xrbar{from{transform:translateX(-10%)}to{transform:translateX(160%)}}
.xr-cmp{position:absolute;top:0;bottom:0;width:2px;background:#ffb347;pointer-events:none;display:none}
.xr-dbg{position:absolute;right:8px;top:calc(var(--xr-inset-top,0px) + 44px);width:250px;background:rgba(0,0,0,.72);font:12px/1.35 ui-monospace,Consolas,monospace;padding:8px;border-radius:8px;display:none}
.xr-dbg.on{display:block}
.xr-dbg label{display:flex;justify-content:space-between;gap:6px;align-items:center;margin:3px 0}
.xr-dbg input[type=range]{width:120px}
.xr-dbg button{min-height:28px;font-size:12px;padding:0 8px;margin:3px 3px 0 0}
@media (prefers-reduced-motion:reduce){.xr-wait .bar i{animation:none}}
`;
function injectCSS(doc) { if (doc.getElementById('xr-css')) return; const s = doc.createElement('style'); s.id = 'xr-css'; s.textContent = CSS; doc.head.appendChild(s); }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const nameOf = o => (o.name || '').replace(/\.\d+$/, '');

// ------------------------------------------------------------------ loader with a shared cache
let _loader = null;
const _models = new Map();
function loader() {
  if (!_loader) { _loader = new GLTFLoader(); _loader.setMeshoptDecoder(MeshoptDecoder); }
  return _loader;
}
export function preloadModel(url) {
  if (!_models.has(url)) _models.set(url, loader().loadAsync(url));
  return _models.get(url);
}
export async function loadCatalog(base) {
  // a plain string, not a URL object: the Base44 editor preview wraps fetch and breaks on URL objects
  const r = await fetch(new URL('engine/catalog.json', base).href, { cache: 'no-cache' });
  if (!r.ok) throw new Error('catalog ' + r.status);
  return r.json();
}

// ------------------------------------------------------------------ the engine
export async function createXray(container, opts = {}) {
  const base = new URL(opts.base || './', location.href);
  const catalog = opts.catalog || await loadCatalog(base);
  const doc = container.ownerDocument; injectCSS(doc);
  container.classList.add('xr'); container.innerHTML = '';
  const emit = (type, data) => { try { opts.onEvent && opts.onEvent(type, data); } catch (e) { console.error(e); } };
  const T0 = performance.now(); const timing = { engine_created_after_page_ms: Math.round(T0) }; const mark = k => { timing[k] = Math.round(performance.now() - T0); emit('timing', { [k]: timing[k] }); };

  // DOM
  const photo = el('img', 'xr-photo'); photo.alt = ''; photo.decoding = 'async'; photo.style.display = 'none';
  const dim = el('div', 'xr-dim');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opts.debug });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'xr-gl';
  const scan = el('canvas', 'xr-scan');
  const cmpLine = el('div', 'xr-cmp');
  const top = el('div', 'xr-top'); const brand = el('div', 'xr-brand', 'Happy Pipes X-Ray'); const found = el('div', 'xr-found'); top.append(brand, found); found.style.display = 'none';
  const note = el('div', 'xr-note'); note.style.display = 'none';
  const say = el('div', 'xr-say');
  const card = el('div', 'xr-card'); const cardH = el('h4'); const cardP = el('p'); const cardX = el('button', 'x', 'Close'); card.append(cardX, cardH, cardP);
  const bar = el('div', 'xr-bar'); const rowL = el('div', 'xr-row'); const rowC = el('div', 'xr-row'); bar.append(say, rowL, rowC);
  const wait = el('div', 'xr-wait'); const waitT = el('div', null, 'Getting the X-ray ready'); const waitB = el('div', 'bar'); waitB.append(el('i')); wait.append(waitT, waitB);
  const dbg = el('div', 'xr-dbg');
  container.append(photo, dim, renderer.domElement, scan, cmpLine, top, note, bar, card, wait, dbg);
  bar.style.visibility = 'hidden';

  // three
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 60);
  scene.add(new THREE.HemisphereLight(0xeef6ff, 0x30363a, 2.2));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(2.5, 4, 3); scene.add(key);
  const rimL = new THREE.DirectionalLight(0xbfe6ff, 1.2); rimL.position.set(-3, 2.5, -3); scene.add(rimL);
  const orbit = Orbit(camera, renderer.domElement);
  const clock = new THREE.Clock();

  const S = {
    mode: 'idle', view: 'solid', overlay: false, playing: true, speed: 1, entry: null, key: null, root: null, mixer: null,
    clips: {}, rest: new Map(), named: new Map(), meshes: [], pose: null, A: null, choice: null, photoSize: null, photoRect: null,
    fit: null, found: new Set(), cardCount: 0, heatOn: false, heatT: 0, lesson: null, tween: null, scanT: -1, align: false,
    revealPx: 0, cmp: null, pd: null, water: [], ghost: null, ghostAll: null, ghostInner: null, glow: [], particles: [], fades: [],
  };

  // ---------------------------------------------------------------- layout
  function layout() {
    const cw = container.clientWidth, ch = container.clientHeight; if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    container.style.setProperty('--xr-bar', (bar.offsetHeight || 0) + 'px');
    if (S.photoSize) {
      const { w, h } = S.photoSize; const topR = 40 + (S.insetTop || 0), botR = bar.offsetHeight || 0; const ah = Math.max(80, ch - topR - botR);
      container.style.setProperty('--xr-bar', botR + 'px');
      const k = Math.min(cw / w, ah / h);
      const pw = w * k, ph = h * k, px = (cw - pw) / 2, py = topR + (ah - ph) / 2;
      S.photoRect = { px, py, pw, ph };
      for (const e of [photo, dim, scan]) Object.assign(e.style, { left: px + 'px', top: py + 'px', width: pw + 'px', height: ph + 'px' });
      scan.width = Math.round(pw * renderer.getPixelRatio()); scan.height = Math.round(ph * renderer.getPixelRatio());
    }
    applyCamera();
  }
  new ResizeObserver(layout).observe(container);
  new ResizeObserver(() => layout()).observe(bar);   // the bar grows when its buttons change: keep the photo and card clear of it

  // ---------------------------------------------------------------- camera states
  // overlay: the photo frame is the camera frame (phone field of view), shifted so the model lands on the AI's box
  // explore: a normal 3D view of the whole canvas. A tween blends the two.
  const cam = { overlay: null, explore: null, k: 0 };
  function poseCamera(pose) {
    const B = S.entry.body_size, H = B.height; const e = THREE.MathUtils.degToRad(pose.elev);
    // the body can sit off the origin (a disposal hangs under its sink): y0 is its bottom, x and z its centre
    const tgt = new THREE.Vector3(B.x || 0, (B.y0 || 0) + H * 0.5, B.z || 0);
    if (S.root) tgt.applyAxisAngle(new THREE.Vector3(0, 1, 0), S.root.rotation.y);
    const pos = tgt.clone().add(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(pose.d));
    return { pos, tgt };
  }
  function overlayState() {
    if (!S.pose || !S.photoRect) return null;
    const { pw, ph, px, py } = S.photoRect; const { pos, tgt } = poseCamera(S.pose);
    return { pos, tgt, fov: S.pose.vfov, aspect: pw / ph, fullW: pw, fullH: ph, x: -px - S.pose.shiftX * pw, y: -py - S.pose.shiftY * ph };
  }
  const EXPLORE_FOV = 38;
  const exploreShift = () => ((bar.offsetHeight || 0) - 40 - (S.insetTop || 0)) / 2;   // keep the model in the clear space between the top line and the bar
  function exploreState() {
    const cw = container.clientWidth, ch = container.clientHeight;
    return { pos: orbit.target.clone().add(new THREE.Vector3().subVectors(camera.position, orbit.target)), tgt: orbit.target.clone(), fov: EXPLORE_FOV, aspect: cw / ch, fullW: cw, fullH: ch, x: 0, y: exploreShift() };
  }
  function applyExploreOffset() {
    const cw = container.clientWidth, ch = container.clientHeight;
    camera.fov = EXPLORE_FOV; camera.aspect = cw / ch; camera.setViewOffset(cw, ch, 0, exploreShift(), cw, ch); camera.updateProjectionMatrix();
  }
  function setCam(st) {
    const cw = container.clientWidth, ch = container.clientHeight;
    camera.fov = st.fov; camera.aspect = st.aspect; camera.position.copy(st.pos); camera.lookAt(st.tgt);
    camera.setViewOffset(st.fullW, st.fullH, st.x, st.y, cw, ch); camera.updateProjectionMatrix();
  }
  function applyCamera() {
    if (!S.root) return;
    if (S.tween) return;                      // the tween sets it each frame
    if (S.overlay && S.pose) { const st = overlayState(); if (st) setCam(st); }
    else applyExploreOffset();
  }
  function lerpCam(a, b, t) {
    const L = (x, y) => x + (y - x) * t;
    return { pos: a.pos.clone().lerp(b.pos, t), tgt: a.tgt.clone().lerp(b.tgt, t), fov: L(a.fov, b.fov), aspect: L(a.aspect, b.aspect), fullW: L(a.fullW, b.fullW), fullH: L(a.fullH, b.fullH), x: L(a.x, b.x), y: L(a.y, b.y) };
  }

  // ---------------------------------------------------------------- model
  async function loadModel(keyName) {
    const entry = catalog.models[keyName]; if (!entry) throw new Error('no model ' + keyName);
    const url = new URL(entry.file, base).href;
    const gltf = await preloadModel(url);
    mark('gltf_parsed');
    if (S.root) scene.remove(S.root);
    const root = gltf.scene.clone(true);           // the cache keeps the pristine copy
    S.entry = entry; S.key = keyName; S.root = root; scene.add(root);
    root.rotation.y = frontRad();
    S.named = new Map(); S.meshes = []; S.rest = new Map();
    const hide = (catalog.hide_always || []).concat(entry.hide || []).map(p => new RegExp(p));
    root.traverse(o => {
      const n = nameOf(o); if (n) S.named.set(n, o);
      if (hide.some(r => r.test(n))) { o.visible = false; o.userData.xrOff = true; o.userData.xrHidden = true; }
      if (o.isMesh) { o.userData.orig = o.material; S.meshes.push(o); }
      S.rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), w: o.morphTargetInfluences ? o.morphTargetInfluences.slice() : null });
    });
    S.mixer = new THREE.AnimationMixer(root); S.clips = {};
    // gltf.scene.clone keeps names, so the clips bind by name to the copy
    for (const c of gltf.animations || []) S.clips[c.name.replace(/\.\d+$/, '')] = c;
    S.mixer.addEventListener('finished', e => onClipDone(e.action));
    const H = entry.body_size.height;
    S.water = [];
    for (const n of entry.water || []) under(n).forEach(m => S.water.push(m));   // a water body can be several meshes
    const wm = waterMaterial(0.26, 1.34, 0.5), wmCut = waterMaterial(0.26, 1.34, 0.82);
    S.waterMat = wm; S.waterMatCut = wmCut;
    S.ghost = ghostMaterial(0x0b4f66, 0x7fe3ff, 0.9);
    S.ghostInner = ghostMaterial(0x082f3d, 0x56c7ea, 0.45);
    S.ghostAll = ghostMaterial(0x0b4f66, 0x9af0ff, 1.0);
    S.cardCount = Object.keys(entry.cards).filter(k => S.named.has(k) && !S.named.get(k).userData.xrOff).length;
    buildFlow(); buildGlow();
    root.updateMatrixWorld(true);
    return entry;
  }
  // parts drawn only in 3D, not over the photo (a furnace photo seldom shows the coil, plenum and piping around it)
  function overlayParts(onPhoto) { for (const n of (S.entry.overlay_hide || [])) { const o = S.named.get(n); if (o && !o.userData.xrOff) o.visible = !onPhoto; } }
  // models built facing another way say so (catalog front_deg); every turn of the root adds it
  const frontRad = () => THREE.MathUtils.degToRad((S.entry && S.entry.front_deg) || 0);
  const under = n => { const o = S.named.get(n); const out = []; if (o) o.traverse(m => { if (m.isMesh) out.push(m); }); return out; };
  const isOff = o => { for (let p = o; p; p = p.parent) if (p.userData.xrOff) return true; return false; };

  // the three looks plus the scan look. Sections are swapped by visibility; materials by assignment.
  function setView(v, opt = {}) {
    const keepHl = S.lesson && (S.entry.lessons || []).find(l => l.key === S.lesson);
    if (S.hl && S.hl.length) clearHighlight();
    S.view = v; const E = S.entry; if (!E) return;
    const shell = new Set(); E.shell.forEach(n => under(n).forEach(m => shell.add(m)));
    const inner = new Set(); (E.ghost_also || []).forEach(n => under(n).forEach(m => inner.add(m)));
    const water = new Set(S.water);
    const secs = E.sections || {}; const secOf = new Set(Object.values(secs)); const solids = new Set(Object.keys(secs));
    const secHide = new Set(E.section_hide || []);
    // visibility by part name, so a part made of several meshes (the toilet's bowl, the furnace's doors) swaps
    // whole: sections only in cutaway; their solids and the section_hide parts out in cutaway. A part the
    // catalog hides stays hidden.
    const cut = v === 'cutaway';
    for (const n of secOf) { const o = S.named.get(n); if (o) { o.visible = cut; o.userData.xrOff = !cut; o.traverse(m => { if (m.isMesh) { m.visible = cut; m.userData.xrOff = !cut; } }); } }
    for (const n of new Set([...solids, ...secHide])) { const o = S.named.get(n); if (o && !o.userData.xrHidden) o.visible = !cut; }
    for (const m of S.meshes) {
      if (v === 'scan') { m.material = S.ghostAll; continue; }
      if (v === 'solid') { m.material = m.userData.orig; continue; }
      if (v === 'xray') {
        if (water.has(m)) m.material = S.waterMat; else if (shell.has(m)) m.material = S.ghost; else if (inner.has(m)) m.material = S.ghostInner; else m.material = m.userData.orig;
        continue;
      }
      // cutaway
      m.material = water.has(m) ? S.waterMatCut : m.userData.orig;
    }
    if (!opt.silent) { syncViewButtons(); emit('view', v); }
    updateFlowVisibility();
    if (keepHl && v !== 'scan') highlight(keepHl.highlight);
  }
  function inSet(m, set) { for (let p = m.parent; p && p !== S.root; p = p.parent) if (set.has(nameOf(p))) return true; return false; }
  function isOffAbove(m) { for (let p = m.parent; p; p = p.parent) if (p.userData.xrOff) return true; return false; }

  // interior parts fade in when the X-ray first opens (cloned materials, swapped back when done)
  function fadeInterior(ms) {
    const E = S.entry; const shell = new Set(); E.shell.concat(E.ghost_also || []).forEach(n => under(n).forEach(m => shell.add(m)));
    S.fades = [];
    for (const m of S.meshes) {
      if (shell.has(m) || S.water.includes(m) || !m.visible || isOff(m)) continue;
      const orig = m.material; const mats = Array.isArray(orig) ? orig : [orig];
      const clones = mats.map(x => { const c = x.clone(); c.transparent = true; c.opacity = 0; return c; });
      m.material = Array.isArray(orig) ? clones : clones[0];
      S.fades.push({ m, orig, clones });
    }
    S.fadeT = { start: performance.now(), ms };
  }
  function stepFade() {
    if (!S.fadeT) return; const t = Math.min(1, (performance.now() - S.fadeT.start) / S.fadeT.ms);
    for (const f of S.fades) f.clones.forEach(c => { c.opacity = t; });
    if (t >= 1) { for (const f of S.fades) { if (f.m.material === f.orig || (Array.isArray(f.m.material) && f.m.material[0] === f.clones[0]) || f.m.material === f.clones[0]) f.m.material = f.orig; f.clones.forEach(c => c.dispose()); } S.fades = []; S.fadeT = null; }
  }

  // ---------------------------------------------------------------- moving water (cold down the dip tube, hot up and out)
  function buildFlow() {
    S.particles.forEach(p => S.root.remove(p.mesh)); S.particles = [];
    const flow = S.entry.flow || {}; const geo = new THREE.SphereGeometry(0.011, 8, 6);
    for (const [kind, pts] of Object.entries(flow)) {
      const path = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const lens = [0]; for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
      const n = 16; const mat = new THREE.MeshBasicMaterial({ color: kind === 'cold' ? 0x52b6ff : 0xff6a33, transparent: true, opacity: 0.95, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
      S.root.add(mesh); S.particles.push({ kind, path, lens, total: lens[lens.length - 1], mesh, n });
    }
  }
  const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3();
  function stepFlow(t) {
    for (const P of S.particles) {
      if (!P.mesh.visible) continue;
      for (let i = 0; i < P.n; i++) {
        const u = ((i / P.n) + t * 0.12) % 1; const d = u * P.total;
        let k = 1; while (k < P.lens.length - 1 && P.lens[k] < d) k++;
        const a = P.path[k - 1], b = P.path[k]; const s = (d - P.lens[k - 1]) / Math.max(1e-6, P.lens[k] - P.lens[k - 1]);
        _v.copy(a).lerp(b, s); const sc = 0.6 + 0.6 * Math.sin(Math.PI * u);
        _m4.makeScale(sc, sc, sc).setPosition(_v); P.mesh.setMatrixAt(i, _m4);
      }
      P.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function updateFlowVisibility() { const on = S.heatOn && !S.lesson && (S.view === 'xray' || S.view === 'cutaway'); S.particles.forEach(p => { p.mesh.visible = on; }); }

  // electric heaters have no heat clip: the glow parts are shown and pulsed here
  function buildGlow() {
    S.glow = [];
    for (const n of ((S.entry.heat || {}).glow || [])) {
      const o = S.named.get(n); if (!o) continue;
      o.traverse(m => { if (m.isMesh) { const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone(); mat.emissive = new THREE.Color(0xff5a1f); mat.emissiveIntensity = 2; m.material = mat; m.userData.orig = mat; } });
      S.glow.push(o);
    }
  }

  // ---------------------------------------------------------------- clips
  function resetPose() {
    S.mixer && S.mixer.stopAllAction();
    S.rest.forEach((r, o) => { o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); if (r.w && o.morphTargetInfluences) r.w.forEach((v, i) => { o.morphTargetInfluences[i] = v; }); });
  }
  function play(name, loop) {
    const c = S.clips[name]; if (!c) return null;
    const a = S.mixer.clipAction(c); a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = true; a.play(); return a;
  }
  function onClipDone(action) {
    const name = action.getClip().name;
    const H = S.entry.heat || {};
    if (S.heatOn && name === H.clip && H.loop) play(H.loop, true);
    // a lesson can carry on in a loop after its opening clip (a furnace's fan starting, then running)
    const L = S.lesson && (S.entry.lessons || []).find(l => l.key === S.lesson);
    if (L && name === L.clip && L.loop) play(L.loop, true);
  }
  function startHeat() {
    clearHighlight(); S.lesson = null; resetPose(); S.heatOn = true; S.heatT = 0;
    const H = S.entry.heat || {};
    if (H.clip) { if (!play(H.clip, false) && H.loop) play(H.loop, true); }
    (H.also || []).forEach(n => play(n, true));   // loops that run alongside, e.g. a furnace's blower
    S.glow.forEach(o => o.scale.set(1, 1, 1));
    updateFlowVisibility(); sayText(H.say); syncLessons('heat');
  }
  // a lesson lights up its part and clears the water so the part can be seen through it
  function clearHighlight() {
    for (const h of S.hl || []) { if (h.m.material === h.mat) h.m.material = h.prev; h.mat.dispose(); }
    S.hl = []; if (S.waterMat) S.waterMat.uniforms.uAlpha.value = 0.5; if (S.waterMatCut) S.waterMatCut.uniforms.uAlpha.value = 0.82;
  }
  function highlight(names) {
    clearHighlight(); S.hl = [];
    for (const n of names || []) for (const m of under(n)) {
      const base = Array.isArray(m.material) ? m.material[0] : m.material;
      const mat = (base.isShaderMaterial ? new THREE.MeshStandardMaterial({ color: 0xffb347 }) : base.clone());
      mat.emissive = new THREE.Color(0xffa030); mat.emissiveIntensity = 0.9; mat.depthTest = false; mat.transparent = true; mat.opacity = 0.95;
      m.renderOrder = 10; S.hl.push({ m, prev: m.material, mat }); m.material = mat;
    }
    if (S.hl.length) { if (S.waterMat) S.waterMat.uniforms.uAlpha.value = 0.22; if (S.waterMatCut) S.waterMatCut.uniforms.uAlpha.value = 0.35; }
  }
  function startLesson(L) {
    clearHighlight();
    if (L.key === 'heat') { startHeat(); return; }
    // a lesson about a part kept off the photo (the furnace's coil) is shown in 3D
    if (S.overlay && (L.highlight || []).some(n => { for (let o = S.named.get(n); o; o = o.parent) if ((S.entry.overlay_hide || []).includes(nameOf(o))) return true; return false; })) enterExplore();
    resetPose(); S.heatOn = false; S.lesson = L.key; S.glow.forEach(o => o.scale.set(0.001, 0.001, 0.001));
    if (S.view === 'solid') setView('xray');
    if (!play(L.clip, false) && L.loop) play(L.loop, true); highlight(L.highlight); updateFlowVisibility(); sayText(L.say); syncLessons(L.key);
    emit('lesson', L.key);
  }

  // ---------------------------------------------------------------- scan effect (2D overlay over the photo)
  function drawScan(t) {
    const g = scan.getContext('2d'); const W = scan.width, H = scan.height; g.clearRect(0, 0, W, H);
    if (t < 0 || t > 1 || !S.A || !S.A.box) return;
    const b = S.A.box; const x0 = b.x * W, y0 = b.y * H, bw = b.w * W, bh = b.h * H;
    const pad = bh * 0.06; const top = y0 - pad, span = bh + pad * 2;
    const y = top + span * t;
    // a soft grid inside the box above the line
    g.save(); g.beginPath(); g.rect(x0 - pad, top, bw + pad * 2, y - top); g.clip();
    g.strokeStyle = 'rgba(127,227,255,0.16)'; g.lineWidth = 1;
    const st = Math.max(10, bw / 10);
    for (let gx = x0 - pad; gx < x0 + bw + pad; gx += st) { g.beginPath(); g.moveTo(gx, top); g.lineTo(gx, y); g.stroke(); }
    for (let gy = top; gy < y; gy += st) { g.beginPath(); g.moveTo(x0 - pad, gy); g.lineTo(x0 + bw + pad, gy); g.stroke(); }
    g.restore();
    const grad = g.createLinearGradient(0, y - 40, 0, y + 6);
    grad.addColorStop(0, 'rgba(127,227,255,0)'); grad.addColorStop(0.85, 'rgba(127,227,255,0.35)'); grad.addColorStop(1, 'rgba(220,250,255,0.95)');
    g.fillStyle = grad; g.fillRect(0, y - 40, W, 46);
    g.fillStyle = 'rgba(235,252,255,1)'; g.fillRect(0, y, W, Math.max(2, H / 300));
    // corner brackets on the box
    g.strokeStyle = 'rgba(127,227,255,0.9)'; g.lineWidth = Math.max(2, W / 250); const c = Math.min(bw, bh) * 0.12;
    [[x0, y0, 1, 1], [x0 + bw, y0, -1, 1], [x0, y0 + bh, 1, -1], [x0 + bw, y0 + bh, -1, -1]].forEach(([cx, cy, sx, sy]) => { g.beginPath(); g.moveTo(cx + sx * c, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * c); g.stroke(); });
    // where the line is, in canvas pixels from the bottom, for the ghost shader reveal
    const dpr = renderer.getPixelRatio(); const ch = container.clientHeight;
    S.revealPx = (ch - (S.photoRect.py + y / dpr)) * dpr;
  }

  // ---------------------------------------------------------------- fit check
  function boxPx(pd) { const b = S.A.box; return { x0: Math.round(b.x * pd.w), y0: Math.round(b.y * pd.h), x1: Math.round((b.x + b.w) * pd.w), y1: Math.round((b.y + b.h) * pd.h) }; }
  function renderSilhouette(w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h);
    const keep = new Map(); const body = new Set(); S.entry.body.forEach(n => under(n).forEach(m => body.add(m)));
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (const m of S.meshes) { keep.set(m, [m.visible, m.material]); m.visible = body.has(m); m.material = white; }
    const hidden = []; S.particles.forEach(p => { if (p.mesh.visible) { hidden.push(p.mesh); p.mesh.visible = false; } });
    const save = { fov: camera.fov, aspect: camera.aspect, view: camera.view ? { ...camera.view } : null, pos: camera.position.clone(), q: camera.quaternion.clone() };
    const { pos, tgt } = poseCamera(S.pose);
    camera.fov = S.pose.vfov; camera.aspect = w / h; camera.position.copy(pos); camera.lookAt(tgt);
    camera.setViewOffset(w, h, -S.pose.shiftX * w, -S.pose.shiftY * h, w, h); camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(pr);
    const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose(); white.dispose();
    const sil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sil[(h - 1 - y) * w + x] = px[(y * w + x) * 4] > 127 ? 1 : 0;
    for (const [m, [v, mat]] of keep) { m.visible = v; m.material = mat; }
    hidden.forEach(m => { m.visible = true; });
    camera.fov = save.fov; camera.aspect = save.aspect; camera.position.copy(save.pos); camera.quaternion.copy(save.q);
    if (save.view && save.view.enabled) camera.setViewOffset(save.view.fullWidth, save.view.fullHeight, save.view.offsetX, save.view.offsetY, save.view.width, save.view.height); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    return sil;
  }
  function measureFit(search) {
    const t0 = performance.now();
    const pd = S.pd; const bp = boxPx(pd);
    const ex = Math.round(Math.max(bp.x1 - bp.x0, bp.y1 - bp.y0) * 0.25);
    const roi = { x0: Math.max(0, bp.x0 - ex), y0: Math.max(0, bp.y0 - ex), x1: Math.min(pd.w, bp.x1 + ex), y1: Math.min(pd.h, bp.y1 + ex) };
    if (!S._edges || S._edgesFor !== S.A) { S._edges = FIT.edgeMap(pd, roi); S._fg = FIT.foregroundMask(pd, bp, roi); S._edgesFor = S.A; }
    let info = FIT.silhouetteInfo(renderSilhouette(pd.w, pd.h), pd.w, pd.h);
    let moved = null;
    if (search && info.n > 20) {
      const best = FIT.searchFit(info, S._edges, S._fg, pd.w, pd.h, bp.y1 - bp.y0);
      // scale about the silhouette centre: change the distance, then shift so the centre lands where the search put it
      const before = { cx: info.cx, cy: info.cy };
      S.pose.d /= best.s; S.pose.widen = (S.pose.widen || 1) * best.sx; applyWiden();
      info = FIT.silhouetteInfo(renderSilhouette(pd.w, pd.h), pd.w, pd.h);
      S.pose.shiftX += (before.cx + best.dx - info.cx) / pd.w; S.pose.shiftY += (before.cy + best.dy - info.cy) / pd.h;
      info = FIT.silhouetteInfo(renderSilhouette(pd.w, pd.h), pd.w, pd.h);
      moved = { s: +best.s.toFixed(3), sx: +best.sx.toFixed(3), dx: +(best.dx / pd.w).toFixed(3), dy: +(best.dy / pd.h).toFixed(3), start: +best.start.toFixed(3) };
    }
    const r = FIT.scoreAt(info, S._edges, S._fg, pd.w, pd.h, 1, 0, 0, Math.max(2, (bp.y1 - bp.y0) * 0.025)); r.shape = FIT.shapeScore(r);
    const sb = info.box; const bw = bp.x1 - bp.x0, bh = bp.y1 - bp.y0;
    const aspectModel = (sb.x1 - sb.x0 + 1) / Math.max(1, sb.y1 - sb.y0 + 1), aspectBox = bw / Math.max(1, bh);
    const aspectRatio = aspectModel / Math.max(0.01, aspectBox);
    S._lastInfo = info;
    const sc = r.sides;
    // the overlay needs the tank's shape found in the photo: outline on edges, BOTH long sides on vertical edges,
    // the top or the bottom on a horizontal edge, and no strong vertical line through the middle
    const e4 = r.edges4;
    // a cabinet has door seams down its face, so a model can relax the middle rule (catalog fit.middle_max)
    const middleMax = (S.entry.fit && S.entry.fit.middle_max != null) ? S.entry.fit.middle_max : FIT_MIDDLE_MAX;
    const good = info.n > 20 && r.edge >= FIT_EDGE_MIN && e4.sidesMin >= FIT_SIDE_EDGE_MIN && e4.capMax >= FIT_CAP_MIN && r.middleV <= middleMax && r.shape >= FIT_GOOD;
    const r3 = v => v == null ? null : +v.toFixed(3);
    S.fit = { shape: +r.shape.toFixed(3), middleV: +r.middleV.toFixed(3), edge: +r.edge.toFixed(3), iou: r.iou == null ? null : +r.iou.toFixed(3), combined: +r.combined.toFixed(3), fgOk: S._fg.ok,
      sides: { left: r3(sc.left), right: r3(sc.right), top: r3(sc.top), bottom: r3(sc.bottom), weakest: r3(sc.weakest) },
      edges4: { left: r3(r.edges4.left), right: r3(r.edges4.right), top: r3(r.edges4.top), bottom: r3(r.edges4.bottom) },
      aspectRatio: +aspectRatio.toFixed(2), good, moved, ms: Math.round(performance.now() - t0) };
    emit('fit', S.fit); renderDebug();
    return S.fit;
  }

  function applyWiden() { const k = (S.pose && S.pose.widen) || 1; S.root.scale.set(k, 1, k); S.root.updateMatrixWorld(true); }
  function initialPose(A) {
    const { w, h } = S.photoSize;
    const vfov = w >= h ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(PHONE_LONG_FOV / 2)) * h / w)) : PHONE_LONG_FOV;
    const pose = { yaw: yawFor(A), elev: ELEV_DEG[A.camera_height] != null ? ELEV_DEG[A.camera_height] : 6, d: 3, shiftX: 0, shiftY: 0, vfov, widen: 1 };
    S.root.rotation.y = pose.yaw + frontRad(); S.root.scale.set(1, 1, 1); S.root.updateMatrixWorld(true);
    // fit the body's projected height to the box height (size goes as 1/distance), then centre it on the box
    const E = S.entry; const B = E.body_size, H = B.height; const pts = [];
    if (B.width) {
      // a cabinet (furnace): the eight corners of its box, centred on the origin like the tanks
      const hw = B.width / 2, hd = (B.depth || B.width) / 2, x0 = B.x || 0, z0 = B.z || 0, y0 = B.y0 || 0;
      for (const x of [x0 - hw, x0 + hw]) for (const z of [z0 - hd, z0 + hd]) pts.push(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y0 + H, z));
    } else {
      const r = B.diameter / 2, x0 = B.x || 0, z0 = B.z || 0, y0 = B.y0 || 0;
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(x0 + Math.cos(a) * r, y0, z0 + Math.sin(a) * r), new THREE.Vector3(x0 + Math.cos(a) * r, y0 + H, z0 + Math.sin(a) * r)); }
    }
    pts.forEach(p => p.applyMatrix4(S.root.matrixWorld));   // the box turns with the model
    const proj = () => {
      const { pos, tgt } = poseCamera(pose); const c = new THREE.PerspectiveCamera(pose.vfov, w / h, 0.01, 100); c.position.copy(pos); c.lookAt(tgt); c.updateMatrixWorld(); c.updateProjectionMatrix();
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const p of pts) { const v = p.clone().project(c); const x = (v.x + 1) / 2, y = (1 - v.y) / 2; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1 };
    };
    for (let i = 0; i < 6; i++) { const p = proj(); pose.d *= (p.y1 - p.y0) / A.box.h; }
    const p = proj();
    pose.shiftX = (A.box.x + A.box.w / 2) - (p.x0 + p.x1) / 2; pose.shiftY = (A.box.y + A.box.h / 2) - (p.y0 + p.y1) / 2;
    return pose;
  }

  // ---------------------------------------------------------------- UI
  const btn = (txt, cls, fn) => { const b = el('button', cls || '', txt); b.type = 'button'; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
  const bPlay = btn('Pause', '', () => setPlaying(!S.playing));
  const seg = el('div', 'xr-seg');
  const vBtns = { solid: btn('Outside', '', () => setView('solid')), xray: btn('X-ray', '', () => setView('xray')), cutaway: btn('Cut open', '', () => setView('cutaway')) };
  seg.append(vBtns.solid, vBtns.xray, vBtns.cutaway);
  const bCmp = btn('Compare', '', () => toggleCompare());
  const bExplore = btn('Explore in 3D', 'go', () => enterExplore());
  const bBack = btn('Back to my photo', '', () => backToPhoto());
  rowC.append(bPlay, seg, bCmp, bExplore, bBack);
  const lessonBtns = {};
  function buildLessons() { rowL.innerHTML = ''; for (const L of S.entry.lessons || []) { const b = btn(L.label, '', () => startLesson(L)); lessonBtns[L.key] = b; rowL.append(b); } }
  function syncLessons(k) { for (const key in lessonBtns) lessonBtns[key].classList.toggle('on', key === k); }
  function syncViewButtons() { for (const k in vBtns) vBtns[k].classList.toggle('on', k === S.view); }
  function syncBar() {
    bCmp.style.display = S.overlay ? '' : 'none';
    bExplore.style.display = S.overlay ? '' : 'none';
    bBack.style.display = (!S.overlay && S.choice && S.choice.mode === 'overlay' && S.fit && S.fit.good && S.photoSize) ? '' : 'none';
  }
  function setPlaying(p) { S.playing = p; bPlay.textContent = p ? 'Pause' : 'Play'; emit('playing', p); }
  let sayTimer = 0;
  function sayText(t) { if (!t) { say.classList.remove('on'); return; } say.textContent = t; say.classList.add('on'); clearTimeout(sayTimer); sayTimer = setTimeout(() => say.classList.remove('on'), 9000); }
  cardX.addEventListener('click', e => { e.stopPropagation(); card.classList.remove('on'); });
  function setNote(t) { note.textContent = t || ''; note.style.display = t ? '' : 'none'; }
  function updateFound() { found.style.display = S.cardCount ? '' : 'none'; found.textContent = `Parts found ${S.found.size} of ${S.cardCount}`; }

  // compare: drag the line; left of it is the plain photo, right of it the X-ray
  function toggleCompare() {
    if (S.cmp != null) { S.cmp = null; renderer.domElement.style.clipPath = ''; dim.style.clipPath = ''; cmpLine.style.display = 'none'; bCmp.classList.remove('on'); return; }
    S.cmp = 0.5; bCmp.classList.add('on'); cmpLine.style.display = ''; applyCompare();
  }
  function applyCompare() {
    if (S.cmp == null || !S.photoRect) return; const cw = container.clientWidth; const x = S.photoRect.px + S.photoRect.pw * S.cmp;
    renderer.domElement.style.clipPath = `inset(0 0 0 ${x}px)`; dim.style.clipPath = `inset(0 0 0 ${x - S.photoRect.px}px)`; cmpLine.style.left = x + 'px';
  }

  // tap a part: card + count. A drag is not a tap.
  const ray = new THREE.Raycaster(); let tapStart = null;
  renderer.domElement.addEventListener('pointerdown', e => { tapStart = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (S.cmp != null) { S.cmpDrag = true; } if (S.align) alignDown(e); });
  renderer.domElement.addEventListener('pointermove', e => {
    if (S.cmpDrag && S.cmp != null && S.photoRect) { const r = container.getBoundingClientRect(); S.cmp = Math.max(0, Math.min(1, (e.clientX - r.left - S.photoRect.px) / S.photoRect.pw)); applyCompare(); }
    if (S.align) alignMove(e);
  });
  renderer.domElement.addEventListener('pointerup', e => {
    S.cmpDrag = false; if (S.align) { alignUp(e); return; }
    const s = tapStart; tapStart = null; if (!s || !S.root || !e.isPrimary || S.mode === 'scanning') return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8 || performance.now() - s.t > 700) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const hits = ray.intersectObject(S.root, true).filter(h => h.object.isMesh && vis(h.object));
    // see-through layers and the water must not swallow taps meant for the parts inside them:
    // a real part first, then the water, then the see-through layers
    const glass = new Set(); if (S.view === 'xray' || S.view === 'scan') S.entry.shell.concat(S.entry.ghost_also || []).forEach(n => under(n).forEach(m => glass.add(m)));
    const water = new Set(S.water);
    const withCard = hits.filter(h => cardFor(h.object));
    const hit = withCard.find(h => !glass.has(h.object) && !water.has(h.object)) || withCard.find(h => water.has(h.object)) || withCard[0];
    if (!hit) return;
    const k = cardFor(hit.object); if (!k) return;
    const [title, text] = S.entry.cards[k];
    cardH.textContent = title; cardP.textContent = text; card.classList.add('on'); say.classList.remove('on');
    if (!S.found.has(k) && S.named.has(k)) { S.found.add(k); updateFound(); }
    emit('tap', { part: k, found: S.found.size, of: S.cardCount });
  });
  // the part's own name (or its pivot's), then the name prefixes on that same part; never the module groups
  // (COMBUSTION, EXTERIOR ...) or the model root, which would give every part the same card
  function cardFor(obj) {
    const C = S.entry.cards, P = S.entry.card_prefix || {};
    const prefixes = Object.keys(P).sort((a, b) => b.length - a.length);
    let depth = 0;
    for (let o = obj; o && o !== S.root && depth < 3; o = o.parent, depth++) {
      let n = nameOf(o); if (!n || /^[A-Z_]+$/.test(n) || n === S.key) break;
      if (n.endsWith('_section')) n = n.slice(0, -8);
      if (n.endsWith('_pivot')) n = n.slice(0, -6);
      if (C[n]) return n;
      for (const p of prefixes) if (n.startsWith(p)) return P[p];
    }
    return null;
  }

  // ---------------------------------------------------------------- manual alignment (testing)
  let ad = null;
  function alignDown(e) { ad = { x: e.clientX, y: e.clientY, id: e.pointerId }; renderer.domElement.setPointerCapture(e.pointerId); }
  function alignMove(e) { if (!ad || e.pointerId !== ad.id || !S.photoRect) return; S.pose.shiftX += (e.clientX - ad.x) / S.photoRect.pw; S.pose.shiftY += (e.clientY - ad.y) / S.photoRect.ph; ad.x = e.clientX; ad.y = e.clientY; applyCamera(); }
  function alignUp() { ad = null; scheduleRefit(); }
  renderer.domElement.addEventListener('wheel', e => { if (!S.align) return; e.preventDefault(); S.pose.d *= Math.exp(e.deltaY * 0.0008); applyCamera(); scheduleRefit(); }, { passive: false });
  let refitT = 0; function scheduleRefit() { clearTimeout(refitT); refitT = setTimeout(() => { if (S.pd && S.A && S.A.box) measureFit(false); }, 150); }
  function renderDebug() {
    if (!opts.debug) return;
    dbg.classList.add('on'); dbg.innerHTML = '';
    const f = S.fit || {}; const p = S.pose || {};
    const lines = [`model ${S.key || '-'}  mode ${S.choice ? S.choice.mode : '-'} (${S.choice ? S.choice.reason : ''})`,
      `shape ${f.shape ?? '-'}  edge ${f.edge ?? '-'}  mid ${f.middleV ?? '-'}`, `sides ${f.edges4 ? f.edges4.left + ' / ' + f.edges4.right : '-'}  caps ${f.edges4 ? f.edges4.top + ' / ' + f.edges4.bottom : '-'}`, `aspect ${f.aspectRatio ?? '-'}  ${f.good ? 'GOOD: overlay' : 'POOR: 3D only'}`,
      f.moved ? `search moved s ${f.moved.s} dx ${f.moved.dx} dy ${f.moved.dy} (from ${f.moved.start})` : '',
      `yaw ${p.yaw != null ? Math.round(THREE.MathUtils.radToDeg(p.yaw)) : '-'}  elev ${p.elev ?? '-'}  d ${p.d ? p.d.toFixed(2) : '-'}`];
    lines.filter(Boolean).forEach(t => dbg.append(el('div', null, t)));
    if (!S.pose) return;
    const slider = (label, min, max, step, get, set) => { const l = el('label'); const s = el('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = get();
      s.addEventListener('input', () => { set(+s.value); applyCamera(); scheduleRefit(); }); l.append(el('span', null, label), s); dbg.append(l); };
    slider('turn', -180, 180, 1, () => Math.round(THREE.MathUtils.radToDeg(S.pose.yaw)), v => { S.pose.yaw = THREE.MathUtils.degToRad(v); S.root.rotation.y = S.pose.yaw + frontRad(); S.root.updateMatrixWorld(true); });
    slider('tilt', -20, 50, 1, () => S.pose.elev, v => { S.pose.elev = v; });
    slider('size', 50, 200, 1, () => Math.round(300 / S.pose.d), v => { S.pose.d = 300 / v; });
    const row = el('div');
    row.append(btn(S.align ? 'Stop moving' : 'Move by hand', S.align ? 'on' : '', () => { S.align = !S.align; orbit.enabled = !S.align && !S.overlay; renderDebug(); }),
      btn('Auto fit', '', () => { measureFit(true); applyCamera(); }),
      btn('Copy pose', '', () => { const t = JSON.stringify({ pose: S.pose, fit: S.fit }); navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); emit('pose', { pose: { ...S.pose }, fit: S.fit }); }));
    dbg.append(row);
  }

  // ---------------------------------------------------------------- the sequence
  async function loadPhoto(src) {
    if (!src) { S.photoSize = null; photo.removeAttribute('src'); photo.style.display = 'none'; return; }
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    photo.style.display = ''; photo.style.opacity = 1; photo.src = url;
    await photo.decode();
    S.photoSize = { w: photo.naturalWidth, h: photo.naturalHeight };
    S.pd = FIT.photoData(photo);
    layout();
  }

  // a host can keep a strip at the top for its own controls (Home Portal puts its back link there)
  function setInsets({ top = 0 } = {}) { S.insetTop = Math.max(0, +top || 0); container.style.setProperty('--xr-inset-top', S.insetTop + 'px'); layout(); }
  async function start({ photo: src, analysis, model, insetTop } = {}) {
    if (insetTop != null) setInsets({ top: insetTop });
    S.mode = 'loading'; wait.style.display = ''; waitT.textContent = 'Getting the X-ray ready'; bar.style.visibility = 'hidden'; card.classList.remove('on');
    setNote(''); sayText(''); S.found = new Set(); S.cmp = null; renderer.domElement.style.clipPath = ''; dim.style.clipPath = ''; cmpLine.style.display = 'none';
    S._edges = null; S.fit = null; S.align = false; S.lesson = null; S.heatOn = false;
    const A = normalizeAnalysis(analysis); S.A = A;
    let choice = model ? { mode: A && A.box ? 'overlay' : 'typical', key: model, reason: 'host_chose' } : pickModel(catalog, A);
    S.choice = choice; emit('choice', choice);
    if (choice.mode === 'none') { S.mode = 'none'; wait.style.display = 'none'; setNote('We can’t X-ray this one yet. Right now the X-ray works on tank water heaters and gas furnaces.'); emit('state', 'none'); return { ok: false, choice }; }
    await Promise.all([loadPhoto(src).then(() => mark('photo_ready')), loadModel(choice.key)]);
    mark('model_ready');
    buildLessons(); updateFound(); syncBar(); layout();
    const typical = S.entry.typical;
    let overlay = choice.mode === 'overlay' && S.photoSize && A && A.box;
    if (overlay) {
      S.pose = initialPose(A); S.overlay = true; overlayParts(true); layout();
      const f = measureFit(true); mark('fit_done');
      if (!f.good) { S.root.scale.set(1, 1, 1); overlayParts(false); overlay = false; S.choice = choice = { ...choice, mode: 'typical', reason: 'poor_fit' }; emit('choice', choice); }
    }
    wait.style.display = 'none';
    if (overlay) {
      S.overlay = true; orbit.enabled = false; applyCamera();
      setNote(`Lined up with your photo. This shows how ${typical} works inside. It is not a scan of yours.`);
      await runScan(); mark('reveal');
      dim.style.opacity = 0.5; setView('xray'); fadeInterior(700); startHeat();
      bar.style.visibility = ''; syncBar();
      S.mode = 'xray';
    } else {
      S.overlay = false; S.pose = S.pose || { yaw: A ? yawFor(A) : 0 };
      if (S.photoSize && A && A.box) await runScan(true); // scan the photo first so the moment still feels like an X-ray
      const why = choice.reason === 'orientation_not_modelled' ? 'We do not have a 3D model for this kind of install yet, ' :
        choice.reason === 'poor_fit' ? 'We could not line this up with your photo, ' : 'We could not match yours exactly, ';
      // picked from the X-Ray menu with no photo: nothing to apologise for
      setNote(!S.photoSize && choice.reason === 'host_chose' ? `This is ${typical} in 3D. Spin it, cut it open, and tap any part to see what it does.` : `${why}so this is ${typical} in 3D. It is not a scan of yours.`);
      enterExplore(true); setView('xray'); fadeInterior(700); startHeat(); mark('reveal');
      bar.style.visibility = ''; syncBar();
    }
    S.mode = S.overlay ? 'xray' : 'explore'; emit('state', S.mode);
    renderDebug();
    return { ok: true, choice, fit: S.fit, timing: { ...timing } };
  }

  function runScan(photoOnly) {
    return new Promise(res => {
      S.mode = 'scanning'; emit('state', 'scanning');
      if (!photoOnly) setView('scan', { silent: true });
      S.ghostAll.uniforms.uRevealOn.value = photoOnly ? 0 : 1;
      if (photoOnly) S.root.visible = false;
      dim.style.opacity = 0.18;
      const t0 = performance.now(), ms = 1900;
      S.scanT = 0; scan.style.display = '';
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms); S.scanT = t; drawScan(t); S.ghostAll.uniforms.uRevealY.value = S.revealPx;
        if (t < 1) requestAnimationFrame(step); else { S.scanT = -1; drawScan(-1); scan.style.display = 'none'; S.ghostAll.uniforms.uRevealOn.value = 0; S.root.visible = true; setTimeout(res, 150); }
      };
      requestAnimationFrame(step);
    });
  }

  function enterExplore(instant) {
    const from = S.overlay && S.pose ? overlayState() : null;
    S.overlay = false; overlayParts(false); S.cmp != null && toggleCompare();
    // frame the whole model, or only the parts a model names (a mini split's wall unit, not its long line runs)
    const box = new THREE.Box3(); const only = S.entry.frame_parts && new Set(S.entry.frame_parts.flatMap(n => under(n)));
    S.root.traverse(o => { if (o.isMesh && o.visible && !isOff(o) && (!only || only.has(o))) box.expandByObject(o); });
    if (box.isEmpty()) S.root.traverse(o => { if (o.isMesh && o.visible && !isOff(o)) box.expandByObject(o); });
    const tgt = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    const cw = container.clientWidth, ch = container.clientHeight; const clearH = Math.max(100, ch - (bar.offsetHeight || 0) - 40 - (S.insetTop || 0));
    const vf = THREE.MathUtils.degToRad(EXPLORE_FOV) * clearH / ch; const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(EXPLORE_FOV) / 2) * cw / ch);
    const dist = Math.max((size.y * 0.55) / Math.tan(vf / 2), (Math.max(size.x, size.z) * 0.6) / Math.tan(hf / 2)) * 1.08;
    const pos = tgt.clone().add(new THREE.Vector3(0.18, 0.14, 1).normalize().multiplyScalar(dist));
    orbit.set(pos, tgt); orbit.maxD = dist * 2.2; orbit.minD = dist * 0.25;
    const to = exploreState();
    photo.style.opacity = 0; dim.style.opacity = 0;
    if (from && !instant) { S.tween = { from, to, start: performance.now(), ms: 1100 }; }
    else { S.tween = null; setCam(to); }
    orbit.enabled = !S.align; syncBar(); emit('state', 'explore'); S.mode = 'explore';
  }
  function backToPhoto() {
    if (!S.photoSize || !S.pose) return;
    S.overlay = true; overlayParts(true); orbit.enabled = false; S.tween = null; photo.style.opacity = 1; dim.style.opacity = 0.5;
    S.root.rotation.y = S.pose.yaw + frontRad(); applyCamera(); syncBar(); emit('state', 'xray'); S.mode = 'xray';
  }

  // ---------------------------------------------------------------- frame loop
  let raf = 0, alive = true, firstFrame = false;
  function frame() {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta()); const run = S.playing ? dt * S.speed : 0;
    if (S.mixer) S.mixer.update(run);
    S._t = (S._t || 0) + run;
    if (S.heatOn) S.heatT = Math.min(1, S.heatT + run / 7);
    for (const m of [S.waterMat, S.waterMatCut]) if (m) { m.uniforms.uHeat.value = S.heatOn ? 0.15 + 0.85 * S.heatT : 0.15; m.uniforms.uTime.value = S._t; }
    for (const g of [S.ghost, S.ghostInner, S.ghostAll]) if (g) g.uniforms.uTime.value = S._t;
    S.glow.forEach(o => o.traverse(m => { if (m.isMesh && m.material.emissiveIntensity != null) m.material.emissiveIntensity = 1.4 + 0.8 * Math.sin(S._t * 3); }));
    stepFlow(S._t); stepFade();
    if (S.tween) {
      const t = Math.min(1, (performance.now() - S.tween.start) / S.tween.ms); setCam(lerpCam(S.tween.from, S.tween.to, ease(t)));
      if (t >= 1) { S.tween = null; applyExploreOffset(); orbit.sync(); }
    }
    if (S.root) renderer.render(scene, camera);
    if (!firstFrame && S.root) { firstFrame = true; mark('first_frame'); }
  }
  frame();

  return {
    version: VERSION, catalog, start, setInsets, setView, setPlaying, enterExplore, backToPhoto,
    lesson: k => { const L = (S.entry.lessons || []).find(l => l.key === k); if (L) startLesson(L); },
    measureFit: search => measureFit(!!search),
    refitFromBox: search => { if (!S.A || !S.A.box) return null; S.pose = initialPose(S.A); const f = measureFit(!!search); applyCamera(); renderDebug(); return f; },
    setAlign: on => { S.align = !!on; orbit.enabled = !S.align && !S.overlay; renderDebug(); },
    getPose: () => S.pose && { ...S.pose }, setPose: p => { Object.assign(S.pose, p); S.root.rotation.y = S.pose.yaw + frontRad(); applyCamera(); },
    debug: () => ({ choice: S.choice, analysis: S.A, fit: S.fit, pose: S.pose && { ...S.pose }, timing: { ...timing }, view: S.view, mode: S.mode, found: [...S.found] }),
    // where a part's centre is on screen (CSS px in the engine's container), for scripted taps
    screenOf: n => { const o = S.named.get(n); if (!o) return null; const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(camera);
      const r = renderer.domElement.getBoundingClientRect(); return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height]; },
    part: n => { const o = S.named.get(n); if (!o) return null; const ws = o.getWorldScale(new THREE.Vector3()); let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      return { visible: vis, off: isOff(o), worldScale: ws.toArray().map(v => +v.toFixed(3)), mat: o.material && (o.material.type || (Array.isArray(o.material) && o.material.map(m => m.type))), hl: (S.hl || []).length }; },
    // debug picture of the fit: photo in grey, vertical edges red, horizontal edges green, model outline cyan
    fitImage: () => {
      const pd = S.pd, E = S._edges, info = S._lastInfo; if (!pd || !E || !info) return null;
      const c = document.createElement('canvas'); c.width = pd.w; c.height = pd.h; const g = c.getContext('2d'); const im = g.createImageData(pd.w, pd.h);
      for (let i = 0; i < pd.w * pd.h; i++) { const v = (pd.rgba[i * 4] + pd.rgba[i * 4 + 1] + pd.rgba[i * 4 + 2]) / 3 * 0.45; let r = v, gg = v, b = v;
        if (E.distV[i] < 1) { r = 255; gg = 40; b = 40; } else if (E.distH[i] < 1) { r = 40; gg = 220; b = 40; }
        im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
      for (let i = 0; i < info.pts.length; i += 4) { const q = (info.pts[i + 1] * pd.w + info.pts[i]) * 4; im.data[q] = 60; im.data[q + 1] = 230; im.data[q + 2] = 255; }
      g.putImageData(im, 0, 0); return c.toDataURL('image/png');
    },
    snapshot: () => { if (S.root) renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.85); },
    destroy: () => { alive = false; cancelAnimationFrame(raf); renderer.dispose(); container.innerHTML = ''; },
  };
}
