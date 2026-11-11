// Cookie & Clay Cutter Maker — user interface.
// Needs cutter-core.js to be loaded first.

(() => {
  const $ = id => document.getElementById(id);
  const S = { img: null, name: 'cutter', analysis: null, result: null, color: '#2f6fdb' };

  // ---------- controls ----------
  const fmt = { threshold: v => v, close: v => v + ' mm', open: v => v + ' mm', blur: v => v + ' px', size: v => v + ' mm',
    height: v => v + ' mm', wall: v => v + ' mm', flangeW: v => v == 0 ? 'none' : v + ' mm', flangeH: v => v + ' mm',
    lineW: v => v + ' mm', reliefH: v => v + ' mm', plateH: v => v + ' mm', detailMin: v => v == 0 ? 'keep all' : v + ' mm' };
  const val = id => parseFloat($(id).value);
  function syncOutputs() {
    for (const k in fmt) $(k + 'Out').textContent = fmt[k]($(k).value);
    $('flangeH').disabled = val('flangeW') === 0;
    $('detailOpts').hidden = $('detail').value === 'off'; $('lineWRow').hidden = $('detail').value !== 'edges';
  }
  for (const k in fmt) $(k).addEventListener('input', () => { syncOutputs(); schedule(); });
  $('mode').addEventListener('change', schedule);
  $('detail').addEventListener('change', () => { S.detailTouched = true; syncOutputs(); schedule(); });
  const presets = {
    cookie: { height: 15, wall: 1.2, flangeW: 4, flangeH: 2, size: 80 },
    clay:   { height: 10, wall: 0.9, flangeW: 3, flangeH: 1.6, size: 50 },
    mini:   { height: 8,  wall: 0.8, flangeW: 2.5, flangeH: 1.4, size: 30 },
  };
  $('preset').addEventListener('click', e => {
    const p = e.target.dataset.p; if (!p) return;
    [...$('preset').children].forEach(b => b.classList.toggle('on', b === e.target));
    for (const k in presets[p]) $(k).value = presets[p][k];
    syncOutputs(); schedule();
  });
  $('swatches').addEventListener('click', e => {
    const c = e.target.dataset.c; if (!c) return;
    [...$('swatches').children].forEach(b => b.classList.toggle('on', b === e.target));
    S.color = c; GL.draw();
  });
  syncOutputs();

  // ---------- ready-made shapes ----------
  // Each shape is one SVG path, or several that are filled separately and merged.
  const rectP = (x0, y0, x1, y1) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  const rrectP = (x0, y0, x1, y1, r) => `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
  const circP = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const ellP = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  const polyP = (n, rot = -Math.PI / 2, r = 46) => {
    let d = '';
    for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (50 + r * Math.sin(a)).toFixed(1); }
    return d + 'Z';
  };
  const starP = (n, ro, ri) => {
    let d = '';
    for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ri : ro; d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (50 + r * Math.sin(a)).toFixed(1); }
    return d + 'Z';
  };
  const SHAPES = [
    { g: 'Basics', id: 'circle', name: 'Circle', d: circP(50, 50, 46) },
    { g: 'Basics', id: 'square', name: 'Square', d: rrectP(6, 6, 94, 94, 10) },
    { g: 'Basics', id: 'rectangle', name: 'Rectangle', d: rrectP(4, 24, 96, 76, 8) },
    { g: 'Basics', id: 'oval', name: 'Oval', d: ellP(50, 50, 46, 32) },
    { g: 'Basics', id: 'triangle', name: 'Triangle', d: 'M50 8L94 88H6Z' },
    { g: 'Basics', id: 'diamond', name: 'Diamond', d: 'M50 4L96 50L50 96L4 50Z' },
    { g: 'Basics', id: 'pentagon', name: 'Pentagon', d: polyP(5) },
    { g: 'Basics', id: 'hexagon', name: 'Hexagon', d: polyP(6) },
    { g: 'Basics', id: 'octagon', name: 'Octagon', d: polyP(8, Math.PI / 8) },
    { g: 'Basics', id: 'plus', name: 'Plus', d: 'M38 6h24v32h32v24H62v32H38V62H6V38h32z' },
    { g: 'Basics', id: 'arrow', name: 'Arrow', d: 'M6 36h48V18l40 32-40 32V64H6Z' },
    { g: 'Basics', id: 'star', name: 'Star', d: starP(5, 47, 21) },
    { g: 'Fun', id: 'heart', name: 'Heart', d: 'M50 92C20 70 8 52 8 36 8 20 20 10 32 10c9 0 15 5 18 12 3-7 9-12 18-12 12 0 24 10 24 26 0 16-12 34-42 56Z' },
    { g: 'Fun', id: 'star6', name: 'Six-point star', d: starP(6, 47, 24) },
    { g: 'Fun', id: 'flower', name: 'Flower', d: [circP(50, 50, 17), circP(50, 24, 18), circP(75, 42, 18), circP(65, 72, 18), circP(35, 72, 18), circP(25, 42, 18)] },
    { g: 'Fun', id: 'cloud', name: 'Cloud', d: [circP(34, 50, 20), circP(58, 38, 24), circP(76, 52, 18), rectP(14, 50, 94, 70)] },
    { g: 'Fun', id: 'moon', name: 'Crescent moon', d: 'M73.4 12.7A44 44 0 1 0 73.4 87.3A38 38 0 1 1 73.4 12.7Z' },
    { g: 'Fun', id: 'bolt', name: 'Lightning bolt', d: 'M58 4L22 54h22l-8 42 40-54H52Z' },
    { g: 'Fun', id: 'leaf', name: 'Leaf', d: 'M50 6C80 30 80 70 50 94 20 70 20 30 50 6Z' },
    { g: 'Fun', id: 'egg', name: 'Egg', d: 'M50 6c18 0 32 24 32 48 0 22-14 40-32 40S18 76 18 54C18 30 32 6 50 6Z' },
    { g: 'Themed', id: 'tree', name: 'Christmas tree', d: ['M50 4L74 40H26Z', 'M50 26L82 66H18Z', 'M50 48L92 92H8Z', rectP(42, 86, 58, 98)] },
    { g: 'Themed', id: 'gingerbread', name: 'Gingerbread man', d: [circP(50, 18, 15), rrectP(37, 28, 63, 70, 11), rrectP(10, 36, 90, 53, 8), rrectP(33, 62, 46, 94, 6), rrectP(54, 62, 67, 94, 6)] },
    { g: 'Themed', id: 'pumpkin', name: 'Pumpkin', d: [ellP(50, 62, 46, 32), ellP(26, 62, 24, 30), ellP(74, 62, 24, 30), rectP(44, 22, 56, 36), 'M56 22c10-6 18-4 22 2-8 4-16 4-22-2Z'] },
    { g: 'Themed', id: 'apple', name: 'Apple', d: [circP(34, 60, 30), circP(66, 60, 30), rectP(47, 22, 53, 38), 'M53 30c6-14 18-18 28-16 2 12-8 22-22 20Z'] },
    { g: 'Themed', id: 'bone', name: 'Dog bone', d: [rectP(26, 40, 74, 60), circP(28, 38, 16), circP(28, 62, 16), circP(72, 38, 16), circP(72, 62, 16)] },
    { g: 'Themed', id: 'fish', name: 'Fish', d: [ellP(58, 50, 34, 24), 'M36 50L6 24v52Z'] },
    { g: 'Themed', id: 'bubble', name: 'Speech bubble', d: [rrectP(6, 10, 94, 70, 14), 'M30 64 26 96 56 68Z'] },
    { g: 'Themed', id: 'shamrock', name: 'Shamrock', d: [circP(32, 36, 21), circP(68, 36, 21), circP(50, 64, 21), rectP(46, 60, 54, 96)] },
  ];
  const paths = s => [].concat(s.d);
  $('shapes').innerHTML = [...new Set(SHAPES.map(s => s.g))].map(g =>
    `<p class="shape-group">${g}</p><div class="shape-grid">` +
    SHAPES.filter(s => s.g === g).map(s =>
      `<button type="button" data-shape="${s.id}" title="${s.name}" aria-label="${s.name}"><svg viewBox="0 0 100 100" aria-hidden="true">${paths(s).map(d => `<path d="${d}"/>`).join('')}</svg></button>`).join('') + '</div>').join('');

  function shapeURL(shape) {
    const N = 1000, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, N, N);
    x.setTransform(N / 100, 0, 0, N / 100, 0, 0); x.fillStyle = '#000';
    for (const d of paths(shape)) x.fill(new Path2D(d));   // filled one by one, so parts merge
    return c.toDataURL();
  }
  function renumber() {
    let i = 0;
    document.querySelectorAll('section.step').forEach(sec => { if (!sec.hidden) sec.querySelector('h2 b').textContent = ++i; });
  }
  function markShape(id) { document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === id)); }
  $('shapes').addEventListener('click', e => {
    const b = e.target.closest('[data-shape]'); if (!b) return;
    const shape = SHAPES.find(s => s.id === b.dataset.shape);
    S.isShape = true; markShape(shape.id); $('step2').hidden = true; renumber();
    // a drawn shape is already clean, so no blurring or smoothing
    $('blur').value = 0; $('close').value = 0; $('open').value = 0; syncOutputs();
    loadURL(shapeURL(shape), shape.id);
  });

  // ---------- loading images ----------
  const drop = $('drop');
  $('file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));
  window.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });

  function loadFile(f) {
    if (!f.type.startsWith('image/')) return showMsg('err', 'That file isn’t an image. Try a PNG or JPG.');
    if (S.isShape) { $('blur').value = 1; $('close').value = 0.6; $('open').value = 0.4; syncOutputs(); }
    S.isShape = false; markShape(null); $('step2').hidden = false; renumber();
    const url = URL.createObjectURL(f);
    loadURL(url, f.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'cutter');
  }
  function loadURL(url, name) {
    const img = new Image();
    img.onload = () => { S.img = img; S.name = name; S.analysis = null; S.detailTouched = false; $('mode').value = 'auto'; process(); };
    img.onerror = () => showMsg('err', 'Couldn’t read that image. If it’s a HEIC photo, try saving it as JPG or PNG first.');
    img.src = url;
  }
  function loadSample() {
    S.isShape = false; markShape(null); $('step2').hidden = false; renumber();
    loadURL(sampleImage('bunny'), 'bunny');
  }
  function sampleImage(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 600; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 600); x.fillStyle = '#222';
    x.beginPath();
    if (kind === 'heart') {
      x.moveTo(300, 520);
      x.bezierCurveTo(80, 380, 40, 230, 120, 150); x.bezierCurveTo(190, 80, 270, 110, 300, 190);
      x.bezierCurveTo(330, 110, 410, 80, 480, 150); x.bezierCurveTo(560, 230, 520, 380, 300, 520);
    } else if (kind === 'star') {
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 115 : 270; x.lineTo(300 + r * Math.cos(a), 315 + r * Math.sin(a)); }
    }
    if (kind !== 'bunny') x.fill('nonzero');
    else { // re-fill each part separately so overlaps don't cancel
      x.beginPath(); x.ellipse(300, 400, 150, 135, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(300, 255, 95, 85, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(255, 135, 32, 95, -0.15, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(350, 135, 32, 95, 0.15, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(165, 450, 45, 45, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(250, 535, 55, 26, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(355, 535, 55, 26, 0, 0, Math.PI * 2); x.fill();
    }
    return c.toDataURL();
  }

  // ---------- processing ----------
  let timer = 0;
  function schedule() { if (!S.img) return; $('busy').classList.add('on'); clearTimeout(timer); timer = setTimeout(process, 220); }
  function showMsg(kind, text) { const m = $('msg'); m.className = 'msg ' + (kind || ''); m.textContent = text || ''; }

  function pixels(img, sx, sy, sw, sh, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return x.getImageData(0, 0, W, H).data;
  }

  function process() {
    $('busy').classList.add('on');
    requestAnimationFrame(() => setTimeout(() => {
      try { run(); showWarnings(); }
      catch (err) { console.error(err); S.result = null; showMsg('err', err.message || 'Something went wrong tracing this picture.'); $('download').disabled = true; $('downloadStamp').hidden = true; drawTrace(); GL.setMesh(null); }
      $('busy').classList.remove('on');
    }, 0));
  }

  function run() {
    const img = S.img, iw = img.naturalWidth, ih = img.naturalHeight;
    // pass 1: low-res, find the shape
    const p = Math.min(1, 700 / Math.max(iw, ih)), pw = Math.max(8, Math.round(iw * p)), ph = Math.max(8, Math.round(ih * p));
    const px1 = pixels(img, 0, 0, iw, ih, pw, ph);
    if (!S.analysis) {
      S.analysis = CutterCore.analyze(px1, pw, ph);
      $('threshold').value = S.analysis.threshold; syncOutputs();
    }
    let mode = $('mode').value;
    if (mode === 'auto') mode = S.analysis.hasAlpha ? 'alpha' : (S.analysis.darkOnLight ? 'dark' : 'light');
    $('threshold').disabled = mode === 'alpha';
    const blur = val('blur'), threshold = val('threshold');
    const raw1 = CutterCore.makeMask(px1, pw, ph, { mode, threshold, blur });
    const m1 = CutterCore.largestFilled(raw1, pw, ph);
    if (!S.detailTouched) { $('detail').value = CutterCore.holeFraction(raw1, pw, ph) > 0.08 ? 'shape' : 'off'; syncOutputs(); }
    const bb = CutterCore.bbox(m1.mask, pw, ph);
    if (!bb || m1.area < 30) throw new Error('No shape found. Try a different outline mode or move the threshold slider.');
    // pass 2: crop to the shape and re-sample at working resolution
    const size = val('size'), ppm = Math.min(8, 1100 / size);
    const longPrev = Math.max(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1);
    const hiPerPrev = size * ppm / longPrev;
    const mg = 3;
    const cx0 = Math.max(0, bb.x0 - mg), cy0 = Math.max(0, bb.y0 - mg), cx1 = Math.min(pw, bb.x1 + 1 + mg), cy1 = Math.min(ph, bb.y1 + 1 + mg);
    const W = Math.round((cx1 - cx0) * hiPerPrev), H = Math.round((cy1 - cy0) * hiPerPrev);
    const sx = cx0 / p, sy = cy0 / p, sw = (cx1 - cx0) / p, sh = (cy1 - cy0) / p;
    const px2 = pixels(img, sx, sy, sw, sh, W, H);
    const mask2 = CutterCore.makeMask(px2, W, H, { mode, threshold, blur: Math.round(blur * hiPerPrev) });
    const opts = { pxPerMm: ppm, wall: val('wall'), height: val('height'), flangeW: val('flangeW'), flangeH: Math.min(val('flangeH'), val('height') - 1), closeMm: val('close'), openMm: val('open'),
      detail: $('detail').value, clearance: 0.5, plateH: val('plateH'), reliefH: val('reliefH'), lineW: val('lineW'), detailMin: val('detailMin') };
    const r = CutterCore.buildCutter(mask2, W, H, opts);
    r.opts = opts; r.map = { sx, sy, hs: W / sw }; // original image px -> hi px
    S.result = r;
    $('download').disabled = false;
    $('emptyTrace').style.display = 'none';
    drawTrace(); GL.setMesh(r);
    const f = v => v.toFixed(0);
    $('sCookie').textContent = `${f(r.size[0])} × ${f(r.size[1])} mm`;
    $('sOuter').textContent = `${f(r.outerSize[0])} × ${f(r.outerSize[1])} mm`;
    $('sHeight').textContent = `${opts.height} mm`;
    $('sTris').textContent = r.stamp ? 'Cutter + stamp' : 'Cutter';
    $('downloadStamp').hidden = !r.stamp;
  }

  function showWarnings() {
    const r = S.result; if (!r) return;
    const o = Math.max(...r.outerSize);
    if (o > 250) showMsg('warn', `This cutter is ${o.toFixed(0)} mm across, which is bigger than most print beds (about 250 mm). Try a smaller size.`);
    else if (r.opts.wall < 0.8) showMsg('warn', 'Walls under 0.8 mm can be fragile and may not print well with a 0.4 mm nozzle.');
    else showMsg('', '');
  }

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
  $('themeBtn').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('cobb3d.pageTheme', t); } catch (e) {}
    drawTrace(); GL.draw();
  });

  // ---------- What's new splash ----------
  // To announce an update: change NEWS.version and edit the items. Everyone sees it once per version.
  const NEWS = {
    version: '2026-11-11.2',
    date: 'November 2026',
    items: [
      { icon: '<circle cx="8" cy="8" r="4.5"/><rect x="13.5" y="3.5" width="9" height="9" rx="1.5"/><path d="M7.5 15.5 3 22h9z"/>', title: 'Ready-made shapes',
        text: 'In a hurry? Pick from hearts, stars, circles, gingerbread men and more — no picture needed.' },
      { icon: '<path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/>', title: 'Stamps for inside detail',
        text: 'Logos and drawings now come with a matching stamp that presses the lines inside your picture into the dough.' },
      { icon: '<path d="M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4"/>', title: 'Cookies match your picture',
        text: 'Cutters and stamps are mirrored for you, so letters and faces come out the right way round.' },
      { icon: '<path d="M4 20l6-6M14 4l6 6-8 8-6-6z"/>', title: 'Fine-tune the detail',
        text: 'Choose what gets raised, how tall it stands and how thin a line can be before it’s skipped.' },
      { icon: '<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.1 1 1.9V16h5.2v-.3c.1-.8.4-1.4 1-1.9A6 6 0 0 0 12 3zM9.5 19h5"/>', title: 'Light and dark look',
        text: 'The page follows the light or dark look you picked on the rest of the site.' },
    ],
  };
  const NEWS_KEY = 'cobb3d.cutterNewsSeen';
  $('newsDate').textContent = 'New · ' + NEWS.date;
  $('newsList').innerHTML = NEWS.items.map(i => `<li><span class="news-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${i.icon}</svg></span><div><b>${i.title}</b><p>${i.text}</p></div></li>`).join('');
  const seen = () => { try { return localStorage.getItem(NEWS_KEY) === NEWS.version; } catch (e) { return true; } };
  const news = $('news');
  const closeNews = () => { if (news.open) news.close(); };
  news.addEventListener('close', () => { try { localStorage.setItem(NEWS_KEY, NEWS.version); } catch (e) {} $('newsDot').hidden = true; });
  news.addEventListener('click', e => { if (e.target === news || e.target.closest('[data-close]')) closeNews(); });
  $('newsSample').addEventListener('click', () => { closeNews(); loadSample(); });
  $('newsBtn').addEventListener('click', () => news.showModal());
  $('newsDot').hidden = seen();
  if (!seen() && typeof news.showModal === 'function') setTimeout(() => news.showModal(), 350);

  // ---------- 2D outline view ----------
  function drawTrace() {
    const c = $('trace'), dpr = devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight;
    c.width = cw * dpr; c.height = ch * dpr;
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
    const r = S.result; if (!r) return;
    const L = r.loops, outer = L.flange || L.wall;
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const s = Math.min((cw - 40) / (maxx - minx), (ch - 40) / (maxy - miny));
    const tx = cw / 2 - s * (minx + maxx) / 2, ty = ch / 2 + s * (miny + maxy) / 2;
    // faded source image under the outline
    const { sx, sy, hs } = r.map, a = s * hs / r.ppm;
    x.save();
    x.setTransform(dpr * a, 0, 0, dpr * a, dpr * (s * (-sx * hs + r.pad - r.cx) / r.ppm + tx), dpr * (s * (-sy * hs + r.pad - r.cy) / r.ppm + ty));
    x.globalAlpha = document.documentElement.dataset.theme === 'dark' ? 0.18 : 0.28;
    if (!S.isShape) x.drawImage(S.img, 0, 0);
    x.restore();
    const acc = css('--accent') || '#1F5FCC';
    const path = (l) => { x.moveTo(s * l[0][0] + tx, -s * l[0][1] + ty); for (const p of l) x.lineTo(s * p[0] + tx, -s * p[1] + ty); x.closePath(); };
    if (L.flange) { x.beginPath(); path(L.flange); path(L.wall); x.fillStyle = rgba(acc, .22); x.fill('evenodd'); }
    x.beginPath(); path(L.wall); path(L.inner); x.fillStyle = acc; x.fill('evenodd');
    x.beginPath(); path(L.inner); x.fillStyle = rgba(css('--banner-line') || '#E8C35A', .25); x.fill();
    if (r.stamp && r.stamp.relief.length) { x.beginPath(); r.stamp.relief.forEach(path); x.fillStyle = css('--ink'); x.globalAlpha = .8; x.fill('evenodd'); x.globalAlpha = 1; }
    // scale bar: 10 mm
    x.fillStyle = css('--muted'); x.fillRect(16, ch - 18, s * 10, 3); x.font = '12px Inter, system-ui'; x.fillText('10 mm', 16, ch - 24);
  }
  new ResizeObserver(() => { drawTrace(); GL.resize(); }).observe($('trace'));

  // ---------- download ----------
  $('download').addEventListener('click', () => {
    const r = S.result; if (!r) return;
    const blob = new Blob([CutterCore.toSTL(r.tris, S.name)], { type: 'model/stl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.name}-cutter-${Math.round(Math.max(...r.size))}mm.stl`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('downloadStamp').addEventListener('click', () => {
    const r = S.result; if (!r || !r.stamp) return;
    const blob = new Blob([CutterCore.toSTL(r.stamp.tris, S.name + ' stamp')], { type: 'model/stl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.name}-stamp-${Math.round(Math.max(...r.size))}mm.stl`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ---------- WebGL preview ----------
  const GL = (() => {
    const c = $('gl'), gl = c.getContext('webgl', { antialias: true });
    if (!gl) return { setMesh() {}, draw() {}, resize() {} };
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;uniform mat4 mvp;varying vec3 vn;varying float vz;void main(){vn=n;vz=p.z;gl_Position=mvp*vec4(p,1.0);}'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 vn;varying float vz;uniform vec3 L;uniform vec3 col;uniform float ground;void main(){vec3 n=normalize(vn);float d=max(dot(n,L),0.0);float rim=pow(1.0-abs(n.z),2.0)*0.08;vec3 c=col*(0.42+0.58*d)+rim;if(ground>0.5){c=col;}gl_FragColor=vec4(c,1.0);}'));
    gl.linkProgram(prog); gl.useProgram(prog);
    const loc = { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), mvp: gl.getUniformLocation(prog, 'mvp'), L: gl.getUniformLocation(prog, 'L'), col: gl.getUniformLocation(prog, 'col'), ground: gl.getUniformLocation(prog, 'ground') };
    const buf = gl.createBuffer(), gbuf = gl.createBuffer();
    let count = 0, radius = 50, height = 15, yaw = -0.9, pitch = 0.75, zoom = 1;
    gl.enable(gl.DEPTH_TEST);

    function setMesh(r) {
      $('empty3d').style.display = r ? 'none' : '';
      if (!r) { count = 0; draw(); return; }
      const xr = tr => { let a = Infinity, b = -Infinity; for (const p of tr) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; } return [a, b]; };
      let t = r.tris;
      if (r.stamp) {
        const [, cMax] = xr(r.tris), [sMin] = xr(r.stamp.tris), dx = cMax - sMin + 10;
        t = t.concat(r.stamp.tris.map(p => [p[0] + dx, p[1], p[2]]));
      }
      const [ax, bx] = xr(t), mid = (ax + bx) / 2;
      t = t.map(p => [p[0] - mid, p[1], p[2]]);
      const d = new Float32Array(t.length * 6);
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b = t[i + 1], cc = t[i + 2];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 3; k++) { const p = t[i + k], o = (i + k) * 6; d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = nx; d[o + 4] = ny; d[o + 5] = nz; }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
      count = t.length;
      radius = 0; for (const p of t) radius = Math.max(radius, Math.hypot(p[0], p[1])); height = r.opts.height;
      const g = radius * 1.35, z = -0.05;
      gl.bindBuffer(gl.ARRAY_BUFFER, gbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-g, -g, z, 0, 0, 1, g, -g, z, 0, 0, 1, g, g, z, 0, 0, 1, -g, -g, z, 0, 0, 1, g, g, z, 0, 0, 1, -g, g, z, 0, 0, 1]), gl.STATIC_DRAW);
      draw();
    }
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
    function persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); }
    function lookAt(e, c, u) {
      const nz = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), nx = norm(cross(u, nz)), ny = cross(nz, nx);
      return new Float32Array([nx[0], ny[0], nz[0], 0, nx[1], ny[1], nz[1], 0, nx[2], ny[2], nz[2], 0, -dot(nx, e), -dot(ny, e), -dot(nz, e), 1]);
    }
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    function resize() { const d = devicePixelRatio || 1; c.width = c.clientWidth * d; c.height = c.clientHeight * d; draw(); }
    function draw() {
      gl.viewport(0, 0, c.width, c.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!count) return;
      const dist = Math.max(radius, height) * 3.3 / zoom, tgt = [0, 0, height * 0.3];
      const eye = [tgt[0] + dist * Math.cos(pitch) * Math.cos(yaw), tgt[1] + dist * Math.cos(pitch) * Math.sin(yaw), tgt[2] + dist * Math.sin(pitch)];
      const mvp = mul(persp(0.7, c.width / c.height, dist * 0.05, dist * 4), lookAt(eye, tgt, [0, 0, 1]));
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      const L = norm([eye[0] - tgt[0] + Math.sin(yaw) * dist * 0.6, eye[1] - tgt[1] - Math.cos(yaw) * dist * 0.6, eye[2] - tgt[2] + dist * 0.8]);
      gl.uniform3fv(loc.L, L);
      const bind = b => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 24, 12); };
      if (pitch > 0) { bind(gbuf); gl.uniform1f(loc.ground, 1); gl.uniform3fv(loc.col, hex(css('--stage-dot') || '#D3CDC3')); gl.drawArrays(gl.TRIANGLES, 0, 6); }
      bind(buf); gl.uniform1f(loc.ground, 0); gl.uniform3fv(loc.col, hex(S.color)); gl.drawArrays(gl.TRIANGLES, 0, count);
    }
    let drag = null;
    c.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      yaw -= (e.clientX - drag[0]) * 0.01; pitch = Math.max(-1.4, Math.min(1.5, pitch + (e.clientY - drag[1]) * 0.01));
      drag = [e.clientX, e.clientY]; draw();
    });
    c.addEventListener('pointerup', () => drag = null);
    c.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.4, Math.min(4, zoom * Math.exp(-e.deltaY * 0.0015))); draw(); }, { passive: false });
    return { setMesh, draw, resize };
  })();
  GL.resize();
})();
