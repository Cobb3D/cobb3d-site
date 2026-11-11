// Geometry tests: every model the app produces must be watertight (printable).
// Run with:  node test/geometry.test.js
const CutterCore = require('../js/cutter-core.js');

let failures = 0;
const fail = (name, msg) => { failures++; console.log(`  FAIL  ${name}: ${msg}`); };
const pass = (name, extra = '') => console.log(`  ok    ${name}${extra ? '  ' + extra : ''}`);

// A closed surface: every directed edge appears exactly once, and its reverse exactly once.
function checkMesh(tris) {
  const key = p => p.map(v => v.toFixed(5)).join(',');
  const edges = new Map();
  let degenerate = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const k = [0, 1, 2].map(j => key(tris[i + j]));
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) degenerate++;
    for (let j = 0; j < 3; j++) {
      const e = k[j] + '|' + k[(j + 1) % 3];
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let open = 0;
  for (const [e, count] of edges) {
    const [a, b] = e.split('|');
    if (count !== 1 || edges.get(b + '|' + a) !== 1) open++;
  }
  let volume = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return { open, degenerate, volume, count: tris.length / 3 };
}

function expectSolid(name, tris, { minVolume = 1 } = {}) {
  const m = checkMesh(tris);
  if (m.open) return fail(name, `${m.open} open edges (not watertight)`);
  if (m.degenerate) return fail(name, `${m.degenerate} zero-area triangles`);
  if (m.volume < minVolume) return fail(name, `volume ${m.volume.toFixed(1)} mm3 — inside-out or empty`);
  pass(name, `${m.count} triangles, ${m.volume.toFixed(0)} mm3`);
  return m;
}

// ---------- test shapes (masks drawn without a browser) ----------
function fromPolygon(w, h, points) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    m[y * w + x] = inside ? 1 : 0;
  }
  return m;
}
const star = (w, h, pts, ro, ri) => fromPolygon(w, h, [...Array(pts * 2)].map((_, i) => {
  const a = i * Math.PI / pts - Math.PI / 2, r = i % 2 ? ri : ro;
  return [w / 2 + r * Math.cos(a), h / 2 + r * Math.sin(a)];
}));
function ring(w, h) { // a C: concave, with a gap that closing should bridge
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - w / 2, dy = y - h / 2, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    m[y * w + x] = (d < w * 0.47 && d > w * 0.17 && !(Math.abs(ang) < 0.04 && d > w * 0.14)) ? 1 : 0;
  }
  return m;
}
function noise(w, h, seed) { // awkward organic blobs
  const m = new Uint8Array(w * h), a = [...Array(6)].map((_, i) => Math.sin(seed * 13.7 + i * 3.1) * 0.5 + 0.7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.sin(x / (20 * a[0]) + a[1] * 5) + Math.cos(y / (18 * a[2])) + Math.sin((x - y) / (30 * a[3])) + Math.cos((x + y) / (25 * a[4]));
    m[y * w + x] = v > a[5] ? 1 : 0;
  }
  return m;
}
function logo(w, h) { // a ring, spokes and a letter with counters — detail inside the outline
  const m = new Uint8Array(w * h), c = w / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    let v = 0;
    if (d < w * 0.475 && d > w * 0.41) v = 1;
    if (Math.abs(Math.atan2(dy, dx) % (Math.PI / 3)) < 0.05 && d > w * 0.25 && d < w * 0.41) v = 1;
    if (Math.abs(dx) < w * 0.14 && Math.abs(dy) < w * 0.2) {
      v = 1;
      if (Math.abs(dx + 10) < w * 0.06 && (Math.abs(dy + 75) < w * 0.056 || Math.abs(dy - 75) < w * 0.056)) v = 0;
    }
    m[y * w + x] = v;
  }
  return m;
}

const BASE = { pxPerMm: 8, wall: 1.2, height: 15, flangeW: 4, flangeH: 2, closeMm: 0.6, openMm: 0.4, detail: 'off' };
const STAMP = { ...BASE, clearance: 0.5, plateH: 2.4, reliefH: 2.5, lineW: 1.2, detailMin: 0.6 };

console.log('\nCutters');
expectSolid('star, with grip rim', CutterCore.buildCutter(star(800, 800, 5, 390, 160), 800, 800, BASE).tris);
expectSolid('star, no grip rim', CutterCore.buildCutter(star(800, 800, 5, 390, 160), 800, 800, { ...BASE, flangeW: 0 }).tris);
expectSolid('C shape', CutterCore.buildCutter(ring(700, 700), 700, 700, BASE).tris);
expectSolid('organic blobs', CutterCore.buildCutter(noise(700, 700, 3), 700, 700, BASE).tris);

console.log('\nStamps (detail inside the outline)');
for (const detail of ['shape', 'other', 'edges']) {
  const r = CutterCore.buildCutter(logo(800, 800), 800, 800, { ...STAMP, detail });
  expectSolid(`cutter (detail: ${detail})`, r.tris);
  if (!r.stamp) fail(`stamp (detail: ${detail})`, 'no stamp was produced');
  else {
    expectSolid(`stamp  (detail: ${detail})`, r.stamp.tris);
    if (!r.stamp.relief.length) fail(`stamp (detail: ${detail})`, 'stamp has no raised detail');
  }
}

console.log('\nSTL export');
{
  const r = CutterCore.buildCutter(star(600, 600, 5, 280, 120), 600, 600, BASE);
  const buf = CutterCore.toSTL(r.tris, 'test');
  const dv = new DataView(buf), n = dv.getUint32(80, true);
  if (n !== r.tris.length / 3) fail('binary STL', `header says ${n} triangles, mesh has ${r.tris.length / 3}`);
  else if (buf.byteLength !== 84 + n * 50) fail('binary STL', `file is ${buf.byteLength} bytes, expected ${84 + n * 50}`);
  else pass('binary STL', `${n} triangles, ${buf.byteLength} bytes`);
}

console.log('\nAwkward shapes and settings (25 cases)');
{
  let bad = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const opts = {
      ...STAMP, pxPerMm: 8,
      flangeW: seed % 3 ? 4 : 0, closeMm: seed % 2 ? 0.6 : 0, openMm: seed % 4 ? 0.4 : 0,
      detail: ['shape', 'other', 'edges'][seed % 3],
    };
    try {
      const r = CutterCore.buildCutter(noise(500, 500, seed), 500, 500, opts);
      for (const [part, tris] of [['cutter', r.tris], ['stamp', r.stamp && r.stamp.tris]]) {
        if (!tris) continue;
        const m = checkMesh(tris);
        if (m.open || m.degenerate || m.volume < 1) { bad++; console.log(`  FAIL  seed ${seed} ${part}: ${m.open} open edges, ${m.degenerate} degenerate, ${m.volume.toFixed(1)} mm3`); }
      }
    } catch (e) { bad++; console.log(`  FAIL  seed ${seed}: ${e.message}`); }
  }
  failures += bad;
  if (!bad) pass('all 25 cases watertight');
}

console.log(failures ? `\n${failures} failing check(s)\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
