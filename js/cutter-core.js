// Cookie & Clay Cutter Maker — geometry engine.
// Image mask -> signed distance field -> contours -> triangle mesh -> binary STL.
// No dependencies. Also loadable in Node (used by test/geometry.test.js).

// ===== CutterCore: image -> cookie cutter mesh (no dependencies) =====
const CutterCore = (() => {
  // ---------- image analysis ----------
  function luminance(rgba, n) {
    const L = new Float32Array(n), A = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3];
      // composite onto white so transparent areas read as background-ish
      const k = a / 255;
      const r = rgba[i * 4] * k + 255 * (1 - k), g = rgba[i * 4 + 1] * k + 255 * (1 - k), b = rgba[i * 4 + 2] * k + 255 * (1 - k);
      L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      A[i] = a;
    }
    return { L, A };
  }

  function boxBlur(src, w, h, r) {
    if (r < 1) return src;
    let a = Float32Array.from(src), b = new Float32Array(w * h);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {           // horizontal
        let acc = 0; const row = y * w;
        for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc / (2 * r + 1);
          acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {           // vertical
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = acc / (2 * r + 1);
          acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }

  function otsu(L) {
    const hist = new Float64Array(256);
    for (let i = 0; i < L.length; i++) hist[Math.max(0, Math.min(255, L[i] | 0))]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = L.length - wB; if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }

  // Decide automatic settings from the image: transparency? dark-on-light?
  function analyze(rgba, w, h) {
    const n = w * h, { L, A } = luminance(rgba, n);
    let transparentBorder = 0, borderCount = 0, borderLum = 0;
    const visit = i => { borderCount++; borderLum += L[i]; if (A[i] < 200) transparentBorder++; };
    for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { visit(y * w); visit(y * w + w - 1); }
    const hasAlpha = transparentBorder / borderCount > 0.5;
    return { hasAlpha, threshold: otsu(L), darkOnLight: borderLum / borderCount > otsu(L) };
  }

  // mode: 'alpha' | 'dark' | 'light'
  function makeMask(rgba, w, h, { mode, threshold, blur }) {
    const n = w * h, { L, A } = luminance(rgba, n), m = new Uint8Array(n);
    if (mode === 'alpha') {
      const Ab = boxBlur(A, w, h, blur);
      for (let i = 0; i < n; i++) m[i] = Ab[i] > 128 ? 1 : 0;
    } else {
      const Lb = boxBlur(L, w, h, blur);
      for (let i = 0; i < n; i++) m[i] = (mode === 'dark' ? Lb[i] < threshold : Lb[i] > threshold) ? 1 : 0;
    }
    return m;
  }

  // keep the largest connected blob and fill its holes
  function largestFilled(mask, w, h) {
    const n = w * h, label = new Int32Array(n), stack = new Int32Array(n);
    let best = 0, bestSize = 0, cur = 0;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || label[s]) continue;
      cur++; let sp = 0, size = 0; stack[sp++] = s; label[s] = cur;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
      }
      if (size > bestSize) { bestSize = size; best = cur; }
    }
    const out = new Uint8Array(n);
    if (!best) return { mask: out, area: 0 };
    // flood the outside from the border; everything not reached is the filled shape
    const outside = new Uint8Array(n); let sp = 0;
    const push = p => { if (!outside[p] && label[p] !== best) { outside[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w); if (y < h - 1) push(p + w);
    }
    let area = 0;
    for (let i = 0; i < n; i++) if (!outside[i]) { out[i] = 1; area++; }
    return { mask: out, area };
  }

  function bbox(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  function holeFraction(mask, w, h) {
    const f = largestFilled(mask, w, h); if (!f.area) return 0;
    let holes = 0; for (let i = 0; i < w * h; i++) if (f.mask[i] && !mask[i]) holes++;
    return holes / f.area;
  }

  // ---------- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ----------
  function edt1dSafe(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  }
  // distance from each pixel to the nearest pixel where target(mask)=true
  function edt(mask, w, h, targetValue) {
    const INF = 1e20, n = Math.max(w, h);
    const grid = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) grid[i] = mask[i] === targetValue ? 0 : INF;
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
      edt1dSafe(f, h, d, v, z);
      for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
      edt1dSafe(f, w, d, v, z);
      for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
    }
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
    return out;
  }
  // signed distance in pixels to the shape edge: <0 inside, >0 outside
  function sdf(mask, w, h) {
    const dOut = edt(mask, w, h, 1), dIn = edt(mask, w, h, 0), s = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) s[i] = mask[i] ? 0.5 - dIn[i] : dOut[i] - 0.5;
    return s;
  }
  const below = (field, level) => { const m = new Uint8Array(field.length); for (let i = 0; i < field.length; i++) m[i] = field[i] < level ? 1 : 0; return m; };

  // closing (fills gaps/notches) then opening (removes thin spikes)
  function morph(mask, w, h, closeR, openR) {
    let m = mask;
    if (closeR > 0) { m = below(sdf(m, w, h), closeR); m = below(sdf(m, w, h), -closeR); }
    if (openR > 0) { m = below(sdf(m, w, h), -openR); m = below(sdf(m, w, h), openR); }
    return m;
  }

  // ---------- marching squares ----------
  function contours(field, w, h, level) {
    const segs = [], pts = new Map();
    const pt = (id) => {
      if (pts.has(id)) return pts.get(id);
      const horiz = (id & 1) === 0, base = id >> 1, x = base % w, y = (base / w) | 0;
      const a = field[base], b = horiz ? field[base + 1] : field[base + w];
      const t = (level - a) / (b - a);
      const p = horiz ? [x + t, y] : [x, y + t];
      pts.set(id, p); return p;
    };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const tl = field[i] < level, tr = field[i + 1] < level, br = field[i + w + 1] < level, bl = field[i + w] < level;
      const T = i * 2, B = (i + w) * 2, Lf = i * 2 + 1, R = (i + 1) * 2 + 1;
      const e = [];
      if (tl !== tr) e.push(T); if (tr !== br) e.push(R); if (br !== bl) e.push(B); if (bl !== tl) e.push(Lf);
      if (e.length === 2) segs.push(e);
      else if (e.length === 4) {
        const c = (field[i] + field[i + 1] + field[i + w] + field[i + w + 1]) / 4 < level;
        if (c === tl) { segs.push([T, R]); segs.push([B, Lf]); } else { segs.push([T, Lf]); segs.push([R, B]); }
      }
    }
    const adj = new Map();
    segs.forEach((s, k) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(k); } });
    const used = new Uint8Array(segs.length), loops = [];
    for (let k = 0; k < segs.length; k++) {
      if (used[k]) continue;
      used[k] = 1;
      const start = segs[k][0]; let cur = segs[k][1]; const loop = [pt(start)];
      let guard = 0;
      while (cur !== start && guard++ < 1e7) {
        loop.push(pt(cur));
        const nxt = adj.get(cur).find(j => !used[j]);
        if (nxt === undefined) break;
        used[nxt] = 1;
        cur = segs[nxt][0] === cur ? segs[nxt][1] : segs[nxt][0];
      }
      if (loop.length > 2) loops.push(loop);
    }
    return loops;
  }

  const polyArea = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a / 2; };
  function largestLoop(loops) {
    let best = null, ba = 0;
    for (const l of loops) { const a = Math.abs(polyArea(l)); if (a > ba) { ba = a; best = l; } }
    return best;
  }
  function smoothLoop(p, iters) {
    for (let k = 0; k < iters; k++) {
      const n = p.length, q = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
        q[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
      }
      p = q;
    }
    return p;
  }
  function rdpOpen(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function rdpClosed(p, eps) {
    // split at the point farthest from p[0]
    let far = 0, fd = 0;
    for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
    const a = rdpOpen(p.slice(0, far + 1), eps), b = rdpOpen(p.slice(far).concat([p[0]]), eps);
    const out = a.concat(b.slice(1, -1));
    // drop exact/near duplicates
    return out.filter((q, i) => { const r = out[(i + 1) % out.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-6; });
  }

  // ---------- polygon triangulation ----------
  // Adapted from earcut (https://github.com/mapbox/earcut)
  //
  // ISC License
  //
  // Copyright (c) 2016, Mapbox
  //
  // Permission to use, copy, modify, and/or distribute this software for any purpose
  // with or without fee is hereby granted, provided that the above copyright notice
  // and this permission notice appear in all copies.
  //
  // THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  // REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
  // FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  // INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
  // OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
  // TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
  // THIS SOFTWARE.
  const earcut = (() => {
    function earcut(data, holeIndices) {
      const hasHoles = holeIndices && holeIndices.length, outerLen = hasHoles ? holeIndices[0] * 2 : data.length;
      let outerNode = linkedList(data, 0, outerLen, true);
      const triangles = [];
      if (!outerNode || outerNode.next === outerNode.prev) return triangles;
      if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode);
      earcutLinked(outerNode, triangles, 0);
      return triangles;
    }
    function linkedList(data, start, end, clockwise) {
      let last;
      if (clockwise === (signedArea(data, start, end) > 0)) for (let i = start; i < end; i += 2) last = insertNode(i / 2, data[i], data[i + 1], last);
      else for (let i = end - 2; i >= start; i -= 2) last = insertNode(i / 2, data[i], data[i + 1], last);
      if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
      return last;
    }
    function filterPoints(start, end) {
      if (!start) return start; if (!end) end = start;
      let p = start, again;
      do {
        again = false;
        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
          removeNode(p); p = end = p.prev; if (p === p.next) break; again = true;
        } else p = p.next;
      } while (again || p !== end);
      return end;
    }
    function earcutLinked(ear, triangles, pass) {
      if (!ear) return;
      let stop = ear;
      while (ear.prev !== ear.next) {
        const prev = ear.prev, next = ear.next;
        if (isEar(ear)) {
          triangles.push(prev.i, ear.i, next.i); removeNode(ear);
          ear = next.next; stop = next.next; continue;
        }
        ear = next;
        if (ear === stop) {
          if (!pass) earcutLinked(filterPoints(ear), triangles, 1);
          else if (pass === 1) { ear = cureLocalIntersections(filterPoints(ear), triangles); earcutLinked(ear, triangles, 2); }
          else if (pass === 2) splitEarcut(ear, triangles);
          break;
        }
      }
    }
    function isEar(ear) {
      const a = ear.prev, b = ear, c = ear.next;
      if (area(a, b, c) >= 0) return false;
      const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
      const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
      let p = c.next;
      while (p !== a) {
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
          !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
          area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
      }
      return true;
    }
    function cureLocalIntersections(start, triangles) {
      let p = start;
      do {
        const a = p.prev, b = p.next.next;
        if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
          triangles.push(a.i, p.i, b.i); removeNode(p); removeNode(p.next); p = start = b;
        }
        p = p.next;
      } while (p !== start);
      return filterPoints(p);
    }
    function splitEarcut(start, triangles) {
      let a = start;
      do {
        let b = a.next.next;
        while (b !== a.prev) {
          if (a.i !== b.i && isValidDiagonal(a, b)) {
            let c = splitPolygon(a, b);
            a = filterPoints(a, a.next); c = filterPoints(c, c.next);
            earcutLinked(a, triangles, 0); earcutLinked(c, triangles, 0);
            return;
          }
          b = b.next;
        }
        a = a.next;
      } while (a !== start);
    }
    function eliminateHoles(data, holeIndices, outerNode) {
      const queue = [];
      for (let i = 0; i < holeIndices.length; i++) {
        const start = holeIndices[i] * 2, end = i < holeIndices.length - 1 ? holeIndices[i + 1] * 2 : data.length;
        const list = linkedList(data, start, end, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
      }
      queue.sort((a, b) => a.x - b.x);
      for (const h of queue) outerNode = eliminateHole(h, outerNode);
      return outerNode;
    }
    function eliminateHole(hole, outerNode) {
      const bridge = findHoleBridge(hole, outerNode);
      if (!bridge) return outerNode;
      const bridgeReverse = splitPolygon(bridge, hole);
      filterPoints(bridgeReverse, bridgeReverse.next);
      return filterPoints(bridge, bridge.next);
    }
    function findHoleBridge(hole, outerNode) {
      let p = outerNode; const hx = hole.x, hy = hole.y; let qx = -Infinity, m;
      do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
          const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
          if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
        }
        p = p.next;
      } while (p !== outerNode);
      if (!m) return null;
      const stop = m, mx = m.x, my = m.y; let tanMin = Infinity; p = m;
      do {
        if (hx >= p.x && p.x >= mx && hx !== p.x &&
          pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
          const tan = Math.abs(hy - p.y) / (hx - p.x);
          if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) { m = p; tanMin = tan; }
        }
        p = p.next;
      } while (p !== stop);
      return m;
    }
    const sectorContainsSector = (m, p) => area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
    function getLeftmost(start) { let p = start, l = start; do { if (p.x < l.x || (p.x === l.x && p.y < l.y)) l = p; p = p.next; } while (p !== start); return l; }
    const pointInTriangle = (ax, ay, bx, by, cx, cy, px, py) =>
      (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
    const isValidDiagonal = (a, b) => a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
      (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) || area(a, b.prev, b)) ||
        equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
    const area = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    const equals = (a, b) => a.x === b.x && a.y === b.y;
    const sign = n => n > 0 ? 1 : n < 0 ? -1 : 0;
    const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    function intersects(p1, q1, p2, q2) {
      const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1));
      if (o1 !== o2 && o3 !== o4) return true;
      if (o1 === 0 && onSegment(p1, p2, q1)) return true; if (o2 === 0 && onSegment(p1, q2, q1)) return true;
      if (o3 === 0 && onSegment(p2, p1, q2)) return true; if (o4 === 0 && onSegment(p2, q1, q2)) return true;
      return false;
    }
    function intersectsPolygon(a, b) {
      let p = a;
      do { if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true; p = p.next; } while (p !== a);
      return false;
    }
    const locallyInside = (a, b) => area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
    function middleInside(a, b) {
      let p = a, inside = false; const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
      do {
        if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
        p = p.next;
      } while (p !== a);
      return inside;
    }
    function splitPolygon(a, b) {
      const a2 = node(a.i, a.x, a.y), b2 = node(b.i, b.x, b.y), an = a.next, bp = b.prev;
      a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
      return b2;
    }
    function insertNode(i, x, y, last) {
      const p = node(i, x, y);
      if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
      return p;
    }
    const removeNode = p => { p.next.prev = p.prev; p.prev.next = p.next; };
    const node = (i, x, y) => ({ i, x, y, prev: null, next: null, steiner: false });
    function signedArea(data, start, end) { let s = 0; for (let i = start, j = end - 2; i < end; i += 2) { s += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i; } return s; }
    return earcut;
  })();

  // ---------- mesh ----------
  const ccw = (p) => (polyArea(p) > 0 ? p : p.slice().reverse()); // polyArea>0 == CCW in y-up
  function polygon(outer, holes, z, up, tris) {
    const data = [], pts = outer.slice(), hi = [];
    for (const h of holes) { hi.push(pts.length); for (const p of h) pts.push(p); }
    for (const p of pts) data.push(p[0], p[1]);
    const idx = earcut(data, hi);
    // earcut's winding is consistent; decide the flip once from the biggest triangle
    let best = 0, flip = false;
    for (let k = 0; k < idx.length; k += 3) {
      const a = pts[idx[k]], b = pts[idx[k + 1]], c = pts[idx[k + 2]];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cr) > best) { best = Math.abs(cr); flip = (cr > 0) !== up; }
    }
    for (let k = 0; k < idx.length; k += 3) {
      let a = pts[idx[k]], b = pts[idx[k + 1]], c = pts[idx[k + 2]];
      if (flip) { const t = b; b = c; c = t; }
      tris.push([a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z]);
    }
  }
  const annulus = (outer, hole, z, up, tris) => polygon(outer, [hole], z, up, tris);
  const pointIn = (pt, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // nesting: depth and direct parent for each loop
  function nest(loops) {
    const areas = loops.map(l => Math.abs(polyArea(l)));
    return loops.map((l, i) => {
      let depth = 0, parent = -1, pa = Infinity;
      for (let j = 0; j < loops.length; j++) {
        if (j === i || areas[j] <= areas[i] || !pointIn(l[0], loops[j])) continue;
        depth++; if (areas[j] < pa) { pa = areas[j]; parent = j; }
      }
      return { depth, parent };
    });
  }
  function dropSmall(mask, w, h, minPx) {
    const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n), out = new Uint8Array(n), comp = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (!mask[s0] || seen[s0]) continue;
      let sp = 0; stack[sp++] = s0; seen[s0] = 1; comp.length = 0;
      while (sp) {
        const p = stack[--sp]; comp.push(p); const x = p % w;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (p >= w && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
        if (p < n - w && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
      }
      if (comp.length >= minPx) for (const p of comp) out[p] = 1;
    }
    return out;
  }
  // mirror in X so the part reads correctly once flipped over onto the dough
  const mirror = tris => { const o = []; for (let i = 0; i < tris.length; i += 3) { const f = p => [-p[0], p[1], p[2]]; o.push(f(tris[i]), f(tris[i + 2]), f(tris[i + 1])); } return o; };

  function side(loop, z0, z1, outward, tris) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const p = loop[i], q = loop[(i + 1) % n];
      if (outward) {
        tris.push([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1]);
        tris.push([p[0], p[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]);
      } else {
        tris.push([p[0], p[1], z0], [q[0], q[1], z1], [q[0], q[1], z0]);
        tris.push([p[0], p[1], z0], [p[0], p[1], z1], [q[0], q[1], z1]);
      }
    }
  }

  /**
   * Full pipeline from a shape mask (1 = cookie).
   * opts: pxPerMm, wall, height, flangeW, flangeH, closeMm, openMm
   */
  function buildCutter(mask0, w, h, o) {
    const ppm = o.pxPerMm;
    const pad = Math.ceil((o.wall + o.flangeW + o.closeMm + 3) * ppm);
    const W = w + 2 * pad, H = h + 2 * pad;
    let m = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[(y + pad) * W + x + pad] = mask0[y * w + x];
    m = morph(m, W, H, o.closeMm * ppm, o.openMm * ppm);
    const raw = m;
    const filled = largestFilled(m, W, H);
    if (filled.area < 50) throw new Error('No shape found — try adjusting the threshold.');
    m = filled.mask;
    const field = sdf(m, W, H);
    const eps = 0.03 * ppm; // 0.03 mm simplification tolerance
    const loopAt = (lvl) => {
      const l = largestLoop(contours(field, W, H, lvl));
      return rdpClosed(smoothLoop(l, 2), eps);
    };
    const inner = loopAt(0);
    const wallL = loopAt(o.wall * ppm);
    const flangeL = o.flangeW > 0 && o.flangeH > 0 ? loopAt((o.wall + o.flangeW) * ppm) : null;
    // to mm, y-up, centered on the inner shape
    const b = inner.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const dropCollinear = (l) => {
      let pts = l, changed = true;
      while (changed && pts.length > 3) {
        changed = false; const out = [];
        for (let i = 0; i < pts.length; i++) {
          const a = out.length ? out[out.length - 1] : pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
          const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (Math.abs(cr) < 1e-7) { changed = true; continue; }
          out.push(b);
        }
        pts = out;
      }
      return pts;
    };
    const toMm = l => ccw(dropCollinear(l.map(p => [Math.round((p[0] - cx) / ppm * 1e4) / 1e4, Math.round(-(p[1] - cy) / ppm * 1e4) / 1e4])));
    const I = toMm(inner), Wl = toMm(wallL), F = flangeL ? toMm(flangeL) : null;
    const tris = [];
    if (F) {
      annulus(F, I, 0, false, tris);
      side(F, 0, o.flangeH, true, tris);
      annulus(F, Wl, o.flangeH, true, tris);
      side(Wl, o.flangeH, o.height, true, tris);
    } else {
      annulus(Wl, I, 0, false, tris);
      side(Wl, 0, o.height, true, tris);
    }
    annulus(Wl, I, o.height, true, tris);
    side(I, 0, o.height, false, tris);
    let stamp = null;
    if (o.detail && o.detail !== 'off') {
      const clear = o.clearance, margin = 0.4, n = W * H;
      let r = new Uint8Array(n);
      if (o.detail === 'edges') {
        const sr = sdf(raw, W, H), hw = o.lineW * ppm / 2;
        for (let i = 0; i < n; i++) r[i] = Math.abs(sr[i]) < hw ? 1 : 0;
      } else {
        const want = o.detail === 'shape' ? 1 : 0;
        for (let i = 0; i < n; i++) r[i] = m[i] && raw[i] === want ? 1 : 0;
      }
      const lim = -(clear + margin) * ppm;
      for (let i = 0; i < n; i++) if (!(field[i] < lim)) r[i] = 0;
      if (o.detailMin > 0) r = morph(r, W, H, 0, o.detailMin / 2 * ppm);
      r = dropSmall(r, W, H, Math.max(4, 0.8 * ppm * ppm));
      const rf = sdf(r, W, H);
      const rl = contours(rf, W, H, 0).filter(l => Math.abs(polyArea(l)) > 0.5 * ppm * ppm).map(l => rdpClosed(smoothLoop(l, 1), eps)).filter(l => l.length >= 3);
      const P = toMm(loopAt(-clear * ppm)), RL = rl.map(toMm).filter(l => l.length >= 3 && l.every(p => pointIn(p, P)));
      const info = nest(RL), T = o.plateH, Rh = o.reliefH, st = [];
      polygon(P, [], 0, false, st);
      side(P, 0, T, true, st);
      polygon(P, RL.filter((_, i) => info[i].depth === 0), T, true, st);
      RL.forEach((l, i) => {
        const kids = RL.filter((_, j) => info[j].parent === i);
        side(l, T, T + Rh, info[i].depth % 2 === 0, st);
        if (info[i].depth % 2 === 0) polygon(l, kids, T + Rh, true, st);  // top of raised part
        else polygon(l, kids, T, true, st);                                // plate showing through a hole
      });
      stamp = { tris: mirror(st), plate: P, relief: RL, height: T + Rh };
    }
    return {
      tris: mirror(tris), stamp, loops: { inner: I, wall: Wl, flange: F }, cx, cy, pad, ppm,
      size: [(b[2] - b[0]) / ppm, (b[3] - b[1]) / ppm],
      outerSize: (() => { const L = F || Wl; const xs = L.map(p => p[0]), ys = L.map(p => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; })(),
    };
  }

  function toSTL(tris, name = 'cookie_cutter') {
    const n = tris.length / 3, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    const hdr = ('Cobb3D Printing - ' + name).slice(0, 80);
    for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i));
    dv.setUint32(80, n, true);
    let o = 84;
    for (let t = 0; t < n; t++) {
      const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      for (const v of [nx / l, ny / l, nz / l]) { dv.setFloat32(o, v, true); o += 4; }
      for (const p of [a, b, c]) for (const v of p) { dv.setFloat32(o, v, true); o += 4; }
      dv.setUint16(o, 0, true); o += 2;
    }
    return buf;
  }

  return { analyze, makeMask, largestFilled, bbox, buildCutter, toSTL, earcut, contours, sdf, polyArea, holeFraction };
})();
if (typeof module !== 'undefined') module.exports = CutterCore;
