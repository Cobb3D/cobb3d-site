/* Cobb3D storefront — one shared script for every page.
   Products, categories and options all come from /products.json. */
(function () {
  'use strict';

  const CART_KEY = 'cobb3d-cart-v1';
  let storeData = null;

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const params = new URLSearchParams(location.search);

  async function loadStore() {
    if (storeData) return storeData;
    const res = await fetch('products.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load products.json');
    storeData = await res.json();
    storeData.products = (storeData.products || []).filter((p) => !p.hidden);
    return storeData;
  }

  function money(n, store) {
    if (!isNum(n)) return null;
    const cur = (store && store.store && store.store.currency) || 'USD';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n);
  }

  const category = (s, id) => (s.categories || []).find((c) => c.id === id) || { id, name: id, tint: '#E9E5DE' };
  const findTheme = (s, name) => ((s.options.theme || {}).choices || []).find((t) => t.name === name);
  const isKeychain = (p) => p.category === 'keychains';

  // ---------- cart (localStorage) ----------
  function readCart() {
    try { const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) { /* storage blocked */ }
    updateCartCount();
  }
  function addToCart(item) {
    const items = readCart();
    const key = JSON.stringify([item.id, item.opts || {}, item.custom || null]);
    const hit = items.find((i) => i.key === key);
    if (hit) hit.qty = Math.min(99, hit.qty + item.qty);
    else items.push(Object.assign({ key }, item));
    writeCart(items);
  }
  function updateCartCount() {
    const n = readCart().reduce((a, i) => a + (i.qty || 0), 0);
    $$('[data-cart-count]').forEach((el) => { el.textContent = n; });
  }

  // ---------- pricing ----------
  function unitPrice(s, item) {
    if (item.id === '__custom__') {
      const c = s.customDesign || {};
      if (!isNum(c.basePrice) || !isNum(c.perKey)) return null;
      const keys = (item.custom && item.custom.keys) || 1;
      return c.basePrice + c.perKey * keys;
    }
    const p = s.products.find((x) => x.id === item.id);
    if (!p) return null;
    if (item.opts && item.opts.size && Array.isArray(p.sizes)) {
      const sz = p.sizes.find((z) => z.name === item.opts.size);
      if (sz && isNum(sz.price)) return sz.price;
    }
    return isNum(p.price) ? p.price : null;
  }
  function fromPrice(p) {
    const list = [p.price].concat((p.sizes || []).map((z) => z.price)).filter(isNum);
    return list.length ? Math.min.apply(null, list) : null;
  }

  // ---------- keycap illustration ----------
  function themeCaps(letters, theme) {
    return letters.split('').map((l, i) => {
      const bg = i % 2 ? theme.b : theme.a;
      let fg = theme.fg;
      if (fg === 'auto') fg = bg.toUpperCase() === '#FFFFFF' ? '#16181D' : '#FFFFFF';
      if (theme.name === 'Classic' && i % 2) fg = '#16181D';
      return [l, bg, fg];
    });
  }
  function keycapHTML(caps, base, large) {
    return '<div class="kc-base' + (large ? ' kc-lg' : '') + (caps.length > 4 ? ' kc-many' : '') + '" style="background:' + esc(base) + '" aria-hidden="true">' +
      caps.map((c) => '<span class="kc-cap" style="background:' + esc(c[1]) + ';color:' + esc(c[2]) + '">' + esc(c[0]) + '</span>').join('') +
      '</div>';
  }
  function productCaps(s, p, letters, themeName) {
    if (p.preview && !letters) return { caps: p.preview.caps, base: p.preview.base };
    const theme = findTheme(s, themeName || p.fixedTheme || 'Classic') || findTheme(s, 'Classic') || { a: '#fff', b: '#FF6A1A', fg: '#16181D', base: '#16181D', name: 'Classic' };
    const text = (letters || (p.letters && p.letters.default) || 'A').slice(0, 6);
    return { caps: themeCaps(text, theme), base: theme.base };
  }
  function mediaHTML(s, p, opts) {
    opts = opts || {};
    if (p.images && p.images.length && !opts.forceIllustration) {
      return '<img src="' + esc(p.images[0]) + '" alt="' + esc(p.name) + '" loading="lazy">';
    }
    if (isKeychain(p)) {
      const k = productCaps(s, p, opts.letters, opts.theme);
      return keycapHTML(k.caps, k.base, opts.large);
    }
    return '<div class="ph"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>Photo coming soon</div>';
  }

  function cardHTML(s, p) {
    const cat = category(s, p.category);
    const price = fromPrice(p);
    const priceTxt = price == null ? '<span class="soon">Coming soon</span>' :
      '<span class="price">' + ((p.sizes && p.sizes.length > 1) ? 'From ' : '') + esc(money(price, s)) + '</span>';
    const url = 'product.html?id=' + encodeURIComponent(p.id);
    return '<article class="card">' +
      '<a class="card-media" href="' + url + '" style="background:' + esc(cat.tint) + '" tabindex="-1" aria-hidden="true">' +
        (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') + mediaHTML(s, p) +
      '</a>' +
      '<div class="card-body">' +
        '<span class="cat">' + esc(cat.name) + '</span>' +
        '<a class="card-title" href="' + url + '">' + esc(p.name) + '</a>' +
        '<div class="card-foot">' + priceTxt + '<a class="btn btn-dark btn-sm" href="' + url + '">View</a></div>' +
      '</div></article>';
  }

  // ---------- pages ----------
  async function pageHome() {
    const s = await loadStore();
    const featured = s.products.filter((p) => p.featured).slice(0, 4);
    const grid = $('#featured');
    if (grid) grid.innerHTML = (featured.length ? featured : s.products.slice(0, 4)).map((p) => cardHTML(s, p)).join('');
    const tiles = $('#tiles');
    if (tiles) tiles.innerHTML = s.categories.map((c) =>
      '<a class="tile" href="shop.html?cat=' + encodeURIComponent(c.id) + '" style="background:' + esc(c.tint) + '"><strong>' + esc(c.name) + '</strong><span>' + esc(c.blurb || '') + '</span></a>'
    ).join('');
  }

  async function pageShop() {
    const s = await loadStore();
    const state = { cat: params.get('cat') || 'all', sizes: new Set(), q: '', sort: 'featured' };
    const chips = $('#chips');
    const cats = [{ id: 'all', name: 'All' }].concat(s.categories);
    chips.innerHTML = cats.map((c) => '<button type="button" class="chip" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('');
    const search = $('#search'), sort = $('#sort'), grid = $('#grid'), count = $('#count');

    function render() {
      $$('.chip', chips).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
      let list = s.products.filter((p) => state.cat === 'all' || p.category === state.cat);
      if (state.q) {
        const q = state.q.toLowerCase();
        list = list.filter((p) => (p.name + ' ' + (p.description || '') + ' ' + category(s, p.category).name).toLowerCase().includes(q));
      }
      if ($('#f-personal') && $('#f-personal').checked) list = list.filter((p) => (p.options || []).some((o) => o === 'letters') || p.designLink);
      if ($('#f-avail') && $('#f-avail').checked) list = list.filter((p) => fromPrice(p) != null);
      if (state.sort === 'low' || state.sort === 'high') {
        list = list.slice().sort((a, b) => {
          const pa = fromPrice(a), pb = fromPrice(b);
          if (pa == null) return 1; if (pb == null) return -1;
          return state.sort === 'low' ? pa - pb : pb - pa;
        });
      } else if (state.sort === 'name') {
        list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      } else {
        list = list.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
      }
      grid.innerHTML = list.length ? list.map((p) => cardHTML(s, p)).join('') : '<div class="empty">Nothing here yet. Try another category.</div>';
      count.textContent = list.length + (list.length === 1 ? ' product' : ' products');
      const title = state.cat === 'all' ? 'Shop' : category(s, state.cat).name;
      $('#shop-title').textContent = title;
      document.title = title + ' · ' + s.store.name;
    }
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.cat = b.dataset.cat;
      const u = new URL(location.href);
      if (state.cat === 'all') u.searchParams.delete('cat'); else u.searchParams.set('cat', state.cat);
      history.replaceState(null, '', u);
      render();
    });
    search.addEventListener('input', () => { state.q = search.value.trim(); render(); });
    sort.addEventListener('change', () => { state.sort = sort.value; render(); });
    $$('.filters input').forEach((i) => i.addEventListener('change', render));
    render();
  }

  async function pageProduct() {
    const s = await loadStore();
    const p = s.products.find((x) => x.id === params.get('id'));
    const root = $('#pdp');
    if (!p) {
      root.innerHTML = '<div class="empty" style="margin:48px 0">That product isn’t available. <a href="shop.html">Back to the shop</a></div>';
      return;
    }
    const cat = category(s, p.category);
    document.title = p.name + ' · ' + s.store.name;
    const meta = document.querySelector('meta[name=description]');
    if (meta && p.description) meta.setAttribute('content', p.description.slice(0, 155));

    const opts = p.options || [];
    const sel = { qty: 1, img: 0 };
    if (opts.includes('letters')) sel.letters = (p.letters && p.letters.default) || '';
    if (opts.includes('theme') && !p.fixedTheme) sel.theme = s.options.theme.choices[0].name;
    if (opts.includes('switch')) sel.switch = s.options.switch.choices[1] || s.options.switch.choices[0];
    if (opts.includes('color')) sel.color = s.options.color.choices[0].name;
    if (opts.includes('size') && p.sizes && p.sizes.length) sel.size = p.sizes[0].name;

    const imgs = p.images || [];
    const hasIllustration = isKeychain(p);

    root.innerHTML =
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <a href="shop.html?cat=' + encodeURIComponent(cat.id) + '">' + esc(cat.name) + '</a> / ' + esc(p.name) + '</nav>' +
      '<div class="pdp">' +
        '<section class="gallery" aria-label="Photos">' +
          '<div class="stage" id="stage" style="background:' + esc(cat.tint) + '"></div>' +
          ((imgs.length + (hasIllustration && imgs.length ? 1 : 0)) > 1 ? '<div class="thumbs" id="thumbs"></div>' : '') +
        '</section>' +
        '<section class="buy" aria-label="Product details">' +
          '<div><p class="eyebrow">' + esc(cat.name) + (p.badge ? ' · ' + esc(p.badge) : '') + '</p>' +
          '<h1>' + esc(p.name) + '</h1>' +
          '<p class="price" id="price"></p>' +
          '<p class="desc" style="margin:0">' + esc(p.description || '') + '</p></div>' +
          '<div id="opts"></div>' +
          '<div class="qty-row">' +
            '<div class="qty"><button type="button" id="dec" aria-label="Decrease quantity">−</button><output id="qty" aria-live="polite">1</output><button type="button" id="inc" aria-label="Increase quantity">+</button></div>' +
            '<button type="button" class="btn btn-accent" id="add">Add to cart</button>' +
          '</div>' +
          '<p id="added" class="alert ok" role="status" hidden>Added to your cart. <a href="cart.html">View cart</a></p>' +
          (isKeychain(p) ? '<a class="cross" href="designer.html"><span><strong>Want a different shape or a logo?</strong><span>Build it yourself in KeyCapForge</span></span><span aria-hidden="true">→</span></a>' : '') +
          '<ul class="notes"><li>Printed to order</li>' + (s.store.shipsIn ? '<li>Ships in ' + esc(s.store.shipsIn) + '</li>' : '') + (isKeychain(p) ? '<li>Keyring included</li>' : '') + '</ul>' +
        '</section>' +
      '</div>' +
      '<div class="two-col">' +
        '<section><h2 class="h-md">Details</h2><table class="spec" id="specs"></table></section>' +
        '<section><h2 class="h-md">You might also like</h2><div class="grid" id="related" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))"></div></section>' +
      '</div>';

    const optsEl = $('#opts');
    let html = '';
    if (opts.includes('letters')) {
      const max = (p.letters && p.letters.max) || 6;
      html += '<div style="margin-bottom:22px"><label class="field-label" for="letters">Your letters <span class="muted" style="font-weight:400">(1–' + max + ')</span></label>' +
        '<input id="letters" class="inp letters-inp" maxlength="' + max + '" autocomplete="off" value="' + esc(sel.letters) + '"></div>';
    }
    if (sel.theme) {
      html += '<fieldset style="border:0;margin:0 0 22px;padding:0"><legend class="field-label">Theme: <span id="theme-name" style="font-weight:400"></span></legend><div class="swatches">' +
        s.options.theme.choices.map((t) => '<button type="button" class="swatch" data-theme="' + esc(t.name) + '" aria-label="' + esc(t.name) + '"><i class="tri"><b style="background:' + esc(t.a) + '"></b><b style="background:' + esc(t.b) + '"></b><b style="background:' + esc(t.base) + '"></b></i></button>').join('') +
        '</div></fieldset>';
    }
    if (sel.color) {
      html += '<fieldset style="border:0;margin:0 0 22px;padding:0"><legend class="field-label">Color: <span id="color-name" style="font-weight:400"></span></legend><div class="swatches">' +
        s.options.color.choices.map((c) => '<button type="button" class="swatch" data-color="' + esc(c.name) + '" aria-label="' + esc(c.name) + '"><i style="background:' + esc(c.hex) + '"></i></button>').join('') +
        '</div></fieldset>';
    }
    if (sel.size) {
      html += '<fieldset style="border:0;margin:0 0 22px;padding:0"><legend class="field-label">Size</legend><div class="seg">' +
        p.sizes.map((z) => '<button type="button" data-size="' + esc(z.name) + '">' + esc(z.name) + (isNum(z.price) ? '<br><small>' + esc(money(z.price, s)) + '</small>' : '') + '</button>').join('') +
        '</div></fieldset>';
    }
    if (sel.switch) {
      html += '<fieldset style="border:0;margin:0;padding:0"><legend class="field-label">Switch</legend><div class="seg">' +
        s.options.switch.choices.map((c) => '<button type="button" data-switch="' + esc(c) + '">' + esc(c) + '</button>').join('') +
        '</div></fieldset>';
    }
    optsEl.innerHTML = html;

    const specs = Object.assign({}, p.specs || {});
    if (p.fixedTheme) specs.Theme = p.fixedTheme;
    $('#specs').innerHTML = Object.keys(specs).map((k) => '<tr><th scope="row">' + esc(k) + '</th><td>' + esc(specs[k]) + '</td></tr>').join('') || '<tr><td class="muted">—</td></tr>';

    const related = s.products.filter((x) => x.id !== p.id && x.category === p.category).concat(s.products.filter((x) => x.id !== p.id && x.category !== p.category)).slice(0, 2);
    $('#related').innerHTML = related.map((x) => cardHTML(s, x)).join('');

    function drawStage() {
      const stage = $('#stage');
      const showIllustration = hasIllustration && (sel.img === 0 || !imgs.length);
      if (showIllustration) {
        stage.innerHTML = mediaHTML(s, p, { forceIllustration: true, letters: sel.letters, theme: sel.theme, large: true }).replace('kc-base', 'kc-base tilt') +
          '<span class="badge">Live preview</span>';
      } else {
        const i = hasIllustration ? sel.img - 1 : sel.img;
        stage.innerHTML = imgs[i] ? '<img src="' + esc(imgs[i]) + '" alt="' + esc(p.name) + '">' : mediaHTML(s, p);
      }
    }
    function drawThumbs() {
      const t = $('#thumbs'); if (!t) return;
      const items = [];
      if (hasIllustration) items.push('<button type="button" data-img="0" aria-label="Live preview" aria-pressed="' + (sel.img === 0) + '" style="background:' + esc(cat.tint) + ';font-size:12px">Preview</button>');
      imgs.forEach((src, i) => {
        const idx = hasIllustration ? i + 1 : i;
        items.push('<button type="button" data-img="' + idx + '" aria-label="Photo ' + (i + 1) + '" aria-pressed="' + (sel.img === idx) + '"><img src="' + esc(src) + '" alt=""></button>');
      });
      t.innerHTML = items.join('');
    }
    function refresh() {
      $$('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === sel.theme)));
      $$('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === sel.color)));
      $$('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === sel.size)));
      $$('[data-switch]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.switch === sel.switch)));
      if ($('#theme-name')) $('#theme-name').textContent = sel.theme;
      if ($('#color-name')) $('#color-name').textContent = sel.color;
      const price = unitPrice(s, { id: p.id, opts: { size: sel.size } });
      $('#price').innerHTML = price == null ? '<span class="soon">Coming soon</span>' : esc(money(price, s));
      const add = $('#add');
      add.disabled = price == null;
      add.textContent = price == null ? 'Not available yet' : 'Add to cart';
      $('#qty').textContent = sel.qty;
      drawStage(); drawThumbs();
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.theme) sel.theme = b.dataset.theme;
      else if (b.dataset.color) sel.color = b.dataset.color;
      else if (b.dataset.size) sel.size = b.dataset.size;
      else if (b.dataset.switch) sel.switch = b.dataset.switch;
      else if (b.dataset.img != null) sel.img = Number(b.dataset.img);
      else if (b.id === 'inc') sel.qty = Math.min(99, sel.qty + 1);
      else if (b.id === 'dec') sel.qty = Math.max(1, sel.qty - 1);
      else return;
      $('#added').hidden = true;
      refresh();
    });
    const lettersEl = $('#letters');
    if (lettersEl) lettersEl.addEventListener('input', () => {
      sel.letters = lettersEl.value.toUpperCase().replace(/\s+/g, '');
      lettersEl.value = sel.letters;
      $('#added').hidden = true;
      drawStage();
    });
    $('#add').addEventListener('click', () => {
      if (lettersEl && !sel.letters) { lettersEl.focus(); lettersEl.setAttribute('aria-invalid', 'true'); return; }
      const o = {};
      ['letters', 'theme', 'switch', 'color', 'size'].forEach((k) => { if (sel[k]) o[k] = sel[k]; });
      if (p.fixedTheme) o.theme = p.fixedTheme;
      addToCart({ id: p.id, qty: sel.qty, opts: o });
      $('#added').hidden = false;
    });
    refresh();
  }

  function optsSummary(item) {
    const o = item.opts || {};
    const parts = [];
    if (o.letters) parts.push('Letters: ' + o.letters);
    if (o.theme) parts.push(o.theme);
    if (o.color) parts.push(o.color);
    if (o.size) parts.push(o.size);
    if (o.switch) parts.push(o.switch);
    if (item.custom) {
      parts.push(item.custom.keys + (item.custom.keys === 1 ? ' key' : ' keys'));
      if (item.custom.notes) parts.push('Notes: ' + item.custom.notes);
      if (item.custom.design) parts.push('Design attached');
    }
    return parts.join(' · ');
  }

  async function pageCart() {
    const s = await loadStore();
    const list = $('#cart-items'), sum = $('#summary');

    function render() {
      const items = readCart();
      if (!items.length) {
        list.innerHTML = '<div class="empty">Your cart is empty. <a href="shop.html">Browse the shop</a> or <a href="designer.html">design your own</a>.</div>';
        sum.hidden = true; return;
      }
      sum.hidden = false;
      let subtotal = 0, unknown = false;
      list.innerHTML = items.map((it, idx) => {
        const isCustom = it.id === '__custom__';
        const p = isCustom ? null : s.products.find((x) => x.id === it.id);
        const name = isCustom ? (s.customDesign.name || 'Custom design') : (p ? p.name : 'Unavailable item');
        const unit = unitPrice(s, it);
        if (unit == null) unknown = true; else subtotal += unit * it.qty;
        let thumb;
        if (isCustom) thumb = '<div class="thumb" style="background:#FFE3D2">' + keycapHTML([['K', '#fff', '#16181D'], ['C', '#FF6A1A', '#16181D'], ['F', '#fff', '#16181D']].slice(0, Math.min(3, it.custom.keys || 1)), '#16181D') + '</div>';
        else if (p) thumb = '<div class="thumb" style="background:' + esc(category(s, p.category).tint) + '">' + mediaHTML(s, p, { letters: it.opts && it.opts.letters, theme: it.opts && it.opts.theme }) + '</div>';
        else thumb = '<div class="thumb" style="background:#E9E5DE"></div>';
        return '<div class="line" data-idx="' + idx + '">' + thumb +
          '<div class="info"><strong>' + (p ? '<a href="product.html?id=' + encodeURIComponent(p.id) + '" style="color:inherit">' + esc(name) + '</a>' : esc(name)) + '</strong><small>' + esc(optsSummary(it)) + '</small>' +
          '<small>' + (unit == null ? 'Price not set yet' : esc(money(unit, s)) + ' each') + '</small></div>' +
          '<div class="ctrl"><div class="qty"><button type="button" data-act="dec" aria-label="Decrease quantity of ' + esc(name) + '">−</button><output>' + it.qty + '</output><button type="button" data-act="inc" aria-label="Increase quantity of ' + esc(name) + '">+</button></div>' +
          '<button type="button" class="link-btn" data-act="rm">Remove</button></div></div>';
      }).join('');
      const ship = s.store.shipping && isNum(s.store.shipping.price) ? s.store.shipping.price : null;
      $('#subtotal').textContent = unknown ? '—' : money(subtotal, s);
      $('#ship').textContent = ship == null ? 'Calculated at checkout' : money(ship, s);
      const btn = $('#checkout');
      btn.disabled = unknown;
      $('#cart-msg').hidden = !unknown;
      $('#cart-msg').textContent = unknown ? 'Some items don’t have a price yet, so checkout is paused.' : '';
    }

    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const idx = Number(b.closest('.line').dataset.idx);
      const items = readCart(); const it = items[idx]; if (!it) return;
      if (b.dataset.act === 'inc') it.qty = Math.min(99, it.qty + 1);
      if (b.dataset.act === 'dec') it.qty = Math.max(1, it.qty - 1);
      if (b.dataset.act === 'rm') items.splice(idx, 1);
      writeCart(items); render();
    });

    $('#checkout').addEventListener('click', async () => {
      const btn = $('#checkout'), msg = $('#cart-msg');
      const endpoint = s.store.checkoutEndpoint;
      if (!endpoint) {
        msg.hidden = false;
        msg.textContent = 'Online checkout isn’t switched on yet. ' + (s.store.contactEmail ? 'Email ' + s.store.contactEmail + ' to order.' : '');
        return;
      }
      btn.disabled = true; btn.textContent = 'Opening secure checkout…';
      try {
        const items = readCart().map((i) => ({ id: i.id, qty: i.qty, opts: i.opts || {}, custom: i.custom || null }));
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
        location.href = data.url;
      } catch (err) {
        msg.hidden = false; msg.textContent = err.message + '. Please try again.';
        btn.disabled = false; btn.textContent = 'Checkout';
      }
    });
    render();
  }

  async function pageDesigner() {
    const s = await loadStore();
    const frame = $('#kcf');
    frame.src = s.store.designerUrl;
    const c = s.customDesign || {};
    const keysEl = $('#d-keys'), swEl = $('#d-switch'), designEl = $('#d-design'), notesEl = $('#d-notes');
    keysEl.max = c.maxKeys || 8;
    swEl.innerHTML = s.options.switch.choices.map((x, i) => '<option' + (i === 1 ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    function price() {
      const keys = Math.max(1, Math.min(c.maxKeys || 8, parseInt(keysEl.value, 10) || 1));
      const u = unitPrice(s, { id: '__custom__', custom: { keys } });
      $('#d-price').textContent = u == null ? 'Price coming soon' : money(u, s);
      $('#d-add').disabled = u == null;
      return keys;
    }
    keysEl.addEventListener('input', price);
    let origin = '';
    try { origin = new URL(s.store.designerUrl).origin; } catch (e) { /* bad url */ }
    window.addEventListener('message', (e) => {
      if (e.origin !== origin || !e.data || e.data.type !== 'keycapforge:design') return;
      if (typeof e.data.design === 'string') designEl.value = e.data.design.slice(0, 20000);
      if (isNum(e.data.keys)) keysEl.value = e.data.keys;
      $('#d-received').classList.add('on');
      price();
    });
    $('#d-add').addEventListener('click', () => {
      const keys = price();
      addToCart({ id: '__custom__', qty: 1, opts: { switch: swEl.value }, custom: { keys, design: designEl.value.trim(), notes: notesEl.value.trim() } });
      $('#d-added').hidden = false;
    });
    price();
  }

  async function pageThanks() {
    writeCart([]);
  }

  async function pageAdmin() {
    const s = await loadStore();
    const f = $('#admin');
    $('#a-cat').innerHTML = s.categories.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    $('#a-theme').innerHTML = '<option value="">Buyer picks (or none)</option>' + s.options.theme.choices.map((t) => '<option>' + esc(t.name) + '</option>').join('');
    const slug = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let idTouched = false;
    $('#a-id').addEventListener('input', () => { idTouched = true; });

    function build() {
      const v = (id) => ($('#' + id).value || '').trim();
      if (!idTouched) $('#a-id').value = slug(v('a-name'));
      const p = { id: v('a-id'), name: v('a-name'), category: v('a-cat') };
      const priceVal = parseFloat(v('a-price'));
      p.price = isFinite(priceVal) ? priceVal : null;
      if ($('#a-featured').checked) p.featured = true;
      if (v('a-badge')) p.badge = v('a-badge');
      p.description = v('a-desc');
      p.images = v('a-images').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
      p.options = $$('input[name=a-opt]:checked').map((i) => i.value);
      if (p.options.includes('letters')) p.letters = { max: parseInt(v('a-max'), 10) || 6, default: v('a-default').toUpperCase() || 'ABC' };
      if (p.options.includes('size')) {
        p.sizes = v('a-sizes').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const m = l.split('=');
          const pr = parseFloat(m[1]);
          return { name: m[0].trim(), price: isFinite(pr) ? pr : null };
        });
      }
      if (v('a-theme')) p.fixedTheme = v('a-theme');
      const specs = {};
      v('a-specs').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) specs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      p.specs = specs;
      $('#a-out').textContent = JSON.stringify(p, null, 2);
      $('#a-sizes-wrap').hidden = !p.options.includes('size');
      $('#a-letters-wrap').hidden = !p.options.includes('letters');
      const preview = $('#a-preview');
      preview.innerHTML = p.name ? cardHTML(s, p) : '';
      return p;
    }
    f.addEventListener('input', build);
    f.addEventListener('change', build);
    $('#a-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#a-out').textContent); $('#a-status').textContent = 'Copied.'; }
      catch (e) { $('#a-status').textContent = 'Copy failed. Select the text and copy it manually.'; }
    });
    $('#a-download').addEventListener('click', async () => {
      const p = build();
      if (!p.id || !p.name) { $('#a-status').textContent = 'Give the product a name first.'; return; }
      const res = await fetch('products.json', { cache: 'no-cache' });
      const all = await res.json();
      const i = all.products.findIndex((x) => x.id === p.id);
      if (i >= 0) all.products[i] = p; else all.products.push(p);
      const blob = new Blob([JSON.stringify(all, null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'products.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      $('#a-status').textContent = (i >= 0 ? 'Updated' : 'Added') + ' “' + p.name + '”. Replace products.json in your site with the downloaded file.';
    });
    build();
  }

  // ---------- boot ----------
  async function boot() {
    updateCartCount();
    const page = document.body.dataset.page;
    const pages = { home: pageHome, shop: pageShop, product: pageProduct, cart: pageCart, designer: pageDesigner, thanks: pageThanks, admin: pageAdmin };
    try {
      const s = await loadStore();
      $$('[data-store-name]').forEach((el) => { el.textContent = s.store.name; });
      $$('[data-etsy]').forEach((el) => { if (s.store.etsyUrl) { el.href = s.store.etsyUrl; el.hidden = false; } });
      $$('[data-contact]').forEach((el) => { if (s.store.contactEmail) { el.href = 'mailto:' + s.store.contactEmail; el.hidden = false; } });
      $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
      if (pages[page]) await pages[page]();
    } catch (err) {
      const main = $('main');
      if (main) main.insertAdjacentHTML('afterbegin', '<div class="wrap"><p class="alert" role="alert" style="margin-top:24px">Something went wrong loading the store: ' + esc(err.message) + '</p></div>');
      console.error(err);
    }
  }
  window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateCartCount(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
