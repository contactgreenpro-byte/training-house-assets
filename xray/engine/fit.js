// Photo fit check for X-Ray My Home.
// Compares the 3D model's outline (rendered silhouette of the tank body) with the photographed appliance,
// using two cheap signals computed in the browser from a small copy of the photo:
//   edge:  how much of the model's outline lies on a strong edge in the photo (chamfer distance)
//   iou:   overlap between the model silhouette and a rough foreground mask (colours that differ from the
//          background ring just outside the AI's box)
// It also searches a small window of scale and shift that best fits, so a slightly loose AI box still lines up.

export const FIT_SIZE = 320;           // long side of the working copy of the photo, px

export function photoData(img, maxSide = FIT_SIZE) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(8, Math.round(w0 * k)), h = Math.max(8, Math.round(h0 * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return { w, h, rgba: g.getImageData(0, 0, w, h).data };
}

// Sobel magnitude, then keep the strongest 14% inside the region of interest, then chamfer distance maps.
// Edges are split by direction: an up-and-down tank side should only land on an up-and-down edge in the photo,
// so rafters and shelf lines cannot pull the model sideways. dist = any edge, distV = vertical, distH = horizontal.
function chamfer(seed, w, h) {
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = seed[i] ? 0 : 1e6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + 1);
    if (y > 0) { d = Math.min(d, dist[i - w] + 1); if (x > 0) d = Math.min(d, dist[i - w - 1] + 1.4); if (x < w - 1) d = Math.min(d, dist[i - w + 1] + 1.4); }
    dist[i] = d;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let d = dist[i];
    if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
    if (y < h - 1) { d = Math.min(d, dist[i + w] + 1); if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 1.4); if (x > 0) d = Math.min(d, dist[i + w - 1] + 1.4); }
    dist[i] = d;
  }
  return dist;
}
export function edgeMap(pd, roi) {
  const { w, h, rgba } = pd;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const mag = new Float32Array(w * h), GX = new Float32Array(w * h), GY = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
    const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
    mag[i] = Math.hypot(gx, gy); GX[i] = gx; GY[i] = gy;
  }
  const vals = [];
  for (let y = roi.y0; y < roi.y1; y++) for (let x = roi.x0; x < roi.x1; x++) vals.push(mag[y * w + x]);
  vals.sort((a, b) => a - b);
  // the cut-off sits between a floor (smooth shading on a round tank is not an edge) and a ceiling (bright pipes and
  // rafters must not push a dim tank side out of the map)
  const thr = Math.min(110, Math.max(40, vals[Math.floor(vals.length * 0.8)] || 0));
  const any = new Uint8Array(w * h), V = new Uint8Array(w * h), H = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (mag[i] < thr) continue; any[i] = 1;
    const ax = Math.abs(GX[i]), ay = Math.abs(GY[i]);
    if (ax >= ay * 0.7) V[i] = 1;            // brightness changes left to right: a vertical edge
    if (ay >= ax * 0.7) H[i] = 1;
  }
  return { dist: chamfer(any, w, h), distV: chamfer(V, w, h), distH: chamfer(H, w, h), thr, pd };
}

// Rough foreground: pixels inside the box whose colour is far from every background colour sampled in a ring
// around the box. Background colours are clustered (k-means, k=5) so a two-tone wall still counts as wall.
export function foregroundMask(pd, box, roi) {
  const { w, h, rgba } = pd;
  const inBox = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
  const bg = [];
  for (let y = roi.y0; y < roi.y1; y += 2) for (let x = roi.x0; x < roi.x1; x += 2) {
    if (inBox(x, y)) continue; const i = (y * w + x) * 4; bg.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  const mask = new Uint8Array(w * h);
  if (bg.length < 30) return { mask, count: 0, ok: false };
  let C = [];
  for (let k = 0; k < 5; k++) C.push(bg[Math.floor((k + 0.5) * bg.length / 5)].slice());
  for (let it = 0; it < 6; it++) {
    const s = C.map(() => [0, 0, 0, 0]);
    for (const p of bg) { let b = 0, bd = 1e9; C.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = j; } }); const t = s[b]; t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; t[3]++; }
    C = s.map((t, j) => t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : C[j]);
  }
  const near = p => { let bd = 1e9; for (const c of C) { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
  const bgD = bg.map(near).sort((a, b) => a - b);
  const thr = Math.max(28, bgD[Math.floor(bgD.length * 0.9)] * 1.15);
  let count = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const i = y * w + x, q = i * 4;
    if (near([rgba[q], rgba[q + 1], rgba[q + 2]]) > thr) { mask[i] = 1; count++; }
  }
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  // a white heater on a white wall gives almost nothing; say so instead of scoring it as a miss
  return { mask, count, ok: count > area * 0.12 };
}

// silhouette: Uint8Array w*h of the model's body, rendered at the current pose.
// pts holds outline points, 4 numbers each: x, y, flag (1 side, 2 cap, 3 both), and which side the outside is on
// (1 left, 2 right, 3 top, 4 bottom, 0 not known), so the search can test colour steps across the outline.
export function silhouetteInfo(sil, w, h) {
  const pts = [], fill = []; let sx = 0, sy = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sil[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!sil[y * w + x]) continue;
    n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if ((x + y) % 2 === 0) fill.push(x, y);
    const L = !on(x - 1, y), R = !on(x + 1, y), U = !on(x, y - 1), D = !on(x, y + 1);
    const side = L || R, cap = U || D;
    if (side || cap) pts.push(x, y, (side ? 1 : 0) + (cap ? 2 : 0), side ? (L ? 1 : 2) : (U ? 3 : 4));
  }
  return { n, cx: n ? sx / n : w / 2, cy: n ? sy / n : h / 2, pts, fill, box: { x0, y0, x1, y1 }, sil };
}

const STEP_THR = 26;   // colour step (RGB distance) that counts as a real boundary
export function scoreAt(info, edges, fg, w, h, s, dx, dy, tol, sx = 1) {
  const { cx, cy, pts, fill } = info; const rgba = edges.pd ? edges.pd.rgba : null;
  let on = 0, tot = 0; const sd = [0, 0, 0, 0, 0], sn = [0, 0, 0, 0, 0], eh = [0, 0, 0, 0, 0], en = [0, 0, 0, 0, 0];
  const col = (x, y, c) => { x = x < 0 ? 0 : x >= w ? w - 1 : x; y = y < 0 ? 0 : y >= h ? h - 1 : y; return rgba[(y * w + x) * 4 + c]; };
  for (let i = 0; i < pts.length; i += 4) {
    const x = Math.round(cx + (pts[i] - cx) * s * sx + dx), y = Math.round(cy + (pts[i + 1] - cy) * s + dy);
    tot++;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x, f = pts[i + 2];
    const d = f === 1 ? edges.distV[k] : f === 2 ? edges.distH[k] : edges.dist[k];
    const side = pts[i + 3];
    if (d <= tol) { on++; eh[side]++; }
    en[side]++;
    if (rgba && side) {
      const nx = side === 1 ? -1 : side === 2 ? 1 : 0, ny = side === 3 ? -1 : side === 4 ? 1 : 0;
      let e = 0;
      for (let c = 0; c < 3; c++) { let o = 0, n = 0; for (let j = 3; j <= 5; j++) { o += col(x + nx * j, y + ny * j, c); n += col(x - nx * j, y - ny * j, c); } e += ((o - n) / 3) ** 2; }
      sn[side]++; if (Math.sqrt(e) > STEP_THR) sd[side]++;
    }
  }
  const edge = tot ? on / tot : 0;
  const frac = j => sn[j] ? sd[j] / sn[j] : null;
  const sides = { left: frac(1), right: frac(2), top: frac(3), bottom: frac(4) };
  sides.weakest = Math.min(sides.left ?? 1, sides.right ?? 1);
  // edge support per side of the outline: both long sides on a vertical edge, top or bottom on a horizontal one
  const ef = j => en[j] ? eh[j] / en[j] : 0;
  const edges4 = { left: ef(1), right: ef(2), top: ef(3), bottom: ef(4) };
  edges4.sidesMin = Math.min(edges4.left, edges4.right); edges4.capMax = Math.max(edges4.top, edges4.bottom);
  // middle band of the outline: share of points sitting on a vertical edge (pipes, door frames, the tank's own side)
  const half = (info.box.x1 - info.box.x0) / 2 * s * sx; let mid = 0, midN = 0;
  for (let i = 0; i < fill.length; i += 6) {
    const fx = cx + (fill[i] - cx) * s * sx + dx;
    if (Math.abs(fx - (cx + dx)) > half * 0.6) continue;
    const x = Math.round(fx), y = Math.round(cy + (fill[i + 1] - cy) * s + dy);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    midN++; if (edges.distV[y * w + x] < 1) mid++;
  }
  const middleV = midN ? mid / midN : 0;
  let iou = null;
  if (fg && fg.ok) {
    let inter = 0, m = 0;
    for (let i = 0; i < fill.length; i += 2) {
      const x = Math.round(cx + (fill[i] - cx) * s * sx + dx), y = Math.round(cy + (fill[i + 1] - cy) * s + dy);
      m++; if (x >= 0 && y >= 0 && x < w && y < h && fg.mask[y * w + x]) inter++;
    }
    const mArea = m * 2;                  // fill was sampled every other pixel
    const inter2 = inter * 2;
    iou = inter2 / Math.max(1, mArea + fg.count - inter2);
  }
  // the outline on real edges counts most; both tank sides on real colour steps next; rough overlap last
  const combined = rgba ? 0.5 * edge + 0.3 * sides.weakest + 0.2 * (iou == null ? edge : iou) : (iou == null ? edge : 0.65 * edge + 0.35 * iou);
  return { edge, iou, combined, sides, edges4, middleV };
}

// small search around the current pose: scale, width, shift. Returns the best in working-photo pixels.
export function shapeScore(r) {
  return 0.35 * r.edge + 0.25 * r.edges4.sidesMin + 0.15 * r.edges4.capMax + 0.15 * r.sides.weakest + 0.10 * (r.iou == null ? r.edge : r.iou) - 0.6 * Math.max(0, r.middleV - 0.04);
}
export function searchFit(info, edges, fg, w, h, boxH) {
  const tol = Math.max(2, boxH * 0.025);
  const at = (s, sx, dx, dy) => { const r = scoreAt(info, edges, fg, w, h, s, dx, dy, tol, sx); r.shape = shapeScore(r); return r; };
  const span = boxH * 0.08;
  // mild preference for staying near the AI's answer, so a busy background cannot drag the model away
  const pen = (s, sx, dx, dy) => 0.06 * (Math.abs(s - 1) / 0.08 + Math.abs(sx - 1) / 0.16 + Math.hypot(dx, dy) / span);
  let best = { s: 1, sx: 1, dx: 0, dy: 0, pen0: 0, ...at(1, 1, 0, 0) };
  const base = best.shape;
  const tryAt = (s, sx, dx, dy) => {
    if (s < 0.9 || s > 1.1 || sx < 0.9 || sx > 1.18 || Math.abs(dx) > span * 1.01 || Math.abs(dy) > span * 1.01) return;
    const r = at(s, sx, dx, dy); const p = pen(s, sx, dx, dy);
    if (r.shape - p > best.shape - best.pen0) best = { s, sx, dx, dy, ...r, pen0: p };
  };
  // coarse to fine: a wide grid, then two passes of a small grid around the best, each with half the step
  let st = { s: 0.04, sx: 0.08, d: span / 2 };
  for (const s of [0.92, 0.96, 1, 1.04, 1.08]) for (const sx of [0.92, 1, 1.08, 1.16]) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) tryAt(s, sx, i * st.d, j * st.d);
  for (let pass = 0; pass < 3; pass++) {
    st = { s: st.s / 2, sx: st.sx / 2, d: st.d / 2 };
    const c = { ...best };
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) tryAt(c.s + a * st.s, c.sx + b * st.sx, c.dx + i * st.d, c.dy + j * st.d);
  }
  best.start = base; best.tol = tol;
  if (best.shape - best.pen0 < base + 0.02) best = { s: 1, sx: 1, dx: 0, dy: 0, pen0: 0, ...at(1, 1, 0, 0), start: base, tol, kept: true };
  return best;
}
