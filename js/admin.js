/* Cobb3D admin dashboard (admin.html).
   Sign in with GitHub through the admin service (store.adminApi in products.json),
   then add/edit/hide/delete products, upload photos and change store settings.
   Every save commits products.json to GitHub; the live site updates in about a minute. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const ADMIN_FLAG = 'cobb3d.admin';
  const site = () => window.Cobb3DSite;

  let API = '';
  let data = null, sha = null, me = null;
  const previews = {}; // uploaded photo path -> local preview while GitHub Pages republishes

  const app = () => $('#app');
  function status(msg, kind) {
    const el = $('#status');
    if (!msg) { el.hidden = true; return; }
    el.hidden = false; el.className = 'alert' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    el.textContent = msg;
  }
  function setFlag(on) { try { on ? localStorage.setItem(ADMIN_FLAG, '1') : localStorage.removeItem(ADMIN_FLAG); } catch (e) { /* ignore */ } }

  async function api(path, init) {
    const res = await fetch(API + path, Object.assign({ credentials: 'include' }, init || {}));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || ('Request failed (' + res.status + ')')); e.status = res.status; throw e; }
    return body;
  }
  const putJSON = (path, obj, method) => api(path, { method: method || 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

  // ---------- start ----------
  async function start() {
    let pub;
    try { pub = await (await fetch('products.json', { cache: 'no-cache' })).json(); } catch (e) { pub = {}; }
    API = ((pub.store && pub.store.adminApi) || '').replace(/\/+$/, '');
    if (!API) { app().innerHTML = notSetUp('The admin service address (store.adminApi) isn’t set in products.json yet.'); return; }
    try {
      me = (await api('/me')).login;
    } catch (e) {
      if (e.status === 401) { setFlag(false); app().innerHTML = signInCard(); return; }
      app().innerHTML = notSetUp('Couldn’t reach the admin service at ' + esc(API) + '. If you just set it up, give it a minute and reload.');
      return;
    }
    setFlag(true);
    $('#signOut').hidden = false;
    await reload();
    window.addEventListener('hashchange', route);
    route();
  }
  async function reload() {
    const c = await api('/content');
    data = c.data; sha = c.sha;
  }

  function signInCard() {
    const ret = encodeURIComponent('/admin.html' + (location.hash || ''));
    return '<section class="panel" style="max-width:520px;margin:40px auto;text-align:center">' +
      '<span class="brand-mark" aria-hidden="true" style="display:inline-block;width:56px;height:56px;margin-bottom:12px"></span>' +
      '<h1 class="h-md" style="margin-bottom:8px">Owner sign-in</h1>' +
      '<p class="muted" style="margin:0 0 22px">Sign in with the Cobb3D GitHub account to manage products, photos and store settings.</p>' +
      '<a class="btn btn-dark" href="' + esc(API) + '/auth/login?return=' + ret + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>Sign in with GitHub</a>' +
      '</section>';
  }
  function notSetUp(msg) {
    return '<section class="panel" style="max-width:620px;margin:40px auto"><h1 class="h-md">Admin isn’t connected yet</h1><p class="muted">' + msg +
      '</p><p class="muted" style="margin:0">Setup steps are in the README, under “Owner admin”.</p></section>';
  }

  // ---------- routing ----------
  function route() {
    status('');
    const h = location.hash.replace(/^#/, '');
    $$('[data-nav]').forEach((a) => a.setAttribute('aria-current', String((h || 'products').split('=')[0] === a.dataset.nav || (a.dataset.nav === 'products' && /^(edit|new)/.test(h)))));
    if (h === 'settings') return renderSettings();
    if (h === 'new') return renderEditor(null);
    if (h.startsWith('edit=')) return renderEditor(decodeURIComponent(h.slice(5)));
    return renderList();
  }

  // ---------- product list ----------
  function thumbHTML(p) {
    const img = (p.images || [])[0];
    if (img) return '<img src="' + esc(previews[img] || img) + '" alt="">';
    try { return site().mediaHTML(data, p); } catch (e) { return ''; }
  }
  function priceText(p) {
    const list = [p.price].concat((p.sizes || []).map((z) => z.price)).filter(isNum);
    if (!list.length) return '<span class="soon">No price · shows “Coming soon”</span>';
    const m = Math.min.apply(null, list);
    return esc((list.length > 1 ? 'From ' : '') + new Intl.NumberFormat(undefined, { style: 'currency', currency: data.store.currency || 'USD' }).format(m));
  }
  function renderList() {
    const cats = data.categories || [];
    const catName = (id) => (cats.find((c) => c.id === id) || { name: id }).name;
    const rows = data.products.map((p) =>
      '<li class="adm-row">' +
        '<a class="adm-thumb tinted" style="--tint:' + esc((cats.find((c) => c.id === p.category) || {}).tint || '') + '" href="#edit=' + encodeURIComponent(p.id) + '" tabindex="-1" aria-hidden="true">' + thumbHTML(p) + '</a>' +
        '<div class="adm-info"><a class="card-title" href="#edit=' + encodeURIComponent(p.id) + '">' + esc(p.name) + '</a>' +
          '<span class="muted" style="font-size:14px">' + esc(catName(p.category)) + ' · ' + priceText(p) + '</span>' +
          '<span class="adm-tags">' + (p.hidden ? '<span class="tag tag-warn">Hidden</span>' : '<span class="tag tag-ok">Live</span>') + (p.featured ? '<span class="tag">Featured</span>' : '') + ((p.images || []).length ? '' : '<span class="tag">No photos</span>') + '</span></div>' +
        '<div class="adm-actions"><a class="btn btn-ghost btn-sm" href="product.html?id=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener">View</a>' +
          '<a class="btn btn-dark btn-sm" href="#edit=' + encodeURIComponent(p.id) + '">Edit</a></div>' +
      '</li>').join('');
    app().innerHTML =
      '<div class="toolbar"><div><h1 class="h-lg" style="margin-bottom:4px">Products</h1><p class="muted" style="margin:0">Signed in as ' + esc(me) + '. ' + data.products.length + ' products.</p></div>' +
      '<a class="btn btn-accent" href="#new">+ Add product</a></div>' +
      (rows ? '<ul class="adm-list">' + rows + '</ul>' : '<div class="empty">No products yet. <a href="#new">Add your first one</a>.</div>');
  }

  // ---------- product editor ----------
  function renderEditor(id) {
    const isNew = id == null;
    const p = isNew ? { id: '', name: '', category: (data.categories[0] || {}).id, price: null, description: '', images: [], options: [], specs: {} } :
      JSON.parse(JSON.stringify(data.products.find((x) => x.id === id) || {}));
    if (!isNew && !p.id) { app().innerHTML = '<div class="empty">That product doesn’t exist. <a href="#products">Back to products</a></div>'; return; }
    const opts = p.options || [];
    const has = (o) => opts.includes(o);
    const themes = ((data.options.theme || {}).choices || []);
    const specsText = Object.keys(p.specs || {}).map((k) => k + ': ' + p.specs[k]).join('\n');
    const sizesText = (p.sizes || []).map((z) => z.name + (isNum(z.price) ? ' = ' + z.price : '')).join('\n');

    app().innerHTML =
      '<nav class="crumbs"><a href="#products">Products</a> / ' + (isNew ? 'New product' : esc(p.name)) + '</nav>' +
      '<div class="toolbar"><h1 class="h-lg" style="margin:0">' + (isNew ? 'Add a product' : 'Edit product') + '</h1>' +
        '<div class="cta-row">' + (isNew ? '' : '<a class="btn btn-ghost" href="product.html?id=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener">View on site ↗</a>') +
        '<button type="button" class="btn btn-accent" data-act="save">' + (isNew ? 'Publish product' : 'Save changes') + '</button></div></div>' +
      '<div class="shop-layout"><form id="ed" class="shop-main" novalidate>' +
        '<section class="panel"><h2>Basics</h2><div class="admin-grid" style="margin-top:14px">' +
          '<div class="full"><label class="field-label" for="f-name">Product name</label><input id="f-name" class="inp" required value="' + esc(p.name) + '"></div>' +
          '<div><label class="field-label" for="f-cat">Category</label><select id="f-cat" class="inp">' + data.categories.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === p.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
          '<div><label class="field-label" for="f-price">Price <span class="muted" style="font-weight:400">(blank = Coming soon)</span></label><input id="f-price" class="inp" inputmode="decimal" placeholder="e.g. 14.99" value="' + (isNum(p.price) ? p.price : '') + '"></div>' +
          '<div><label class="field-label" for="f-badge">Badge <span class="muted" style="font-weight:400">(optional)</span></label><input id="f-badge" class="inp" placeholder="e.g. New, Personalize" value="' + esc(p.badge || '') + '"></div>' +
          '<div><label class="field-label" for="f-id">Page address</label><input id="f-id" class="inp" value="' + esc(p.id) + '"' + (isNew ? '' : ' readonly aria-describedby="f-id-h"') + '>' + (isNew ? '' : '<small id="f-id-h" class="muted">Fixed after publishing, so links keep working.</small>') + '</div>' +
          '<div class="full"><label class="field-label" for="f-desc">Description</label><textarea id="f-desc" class="inp" rows="5">' + esc(p.description || '') + '</textarea></div>' +
          '<div class="full" style="display:flex;flex-wrap:wrap;gap:4px 28px"><label class="chk"><input type="checkbox" id="f-featured"' + (p.featured ? ' checked' : '') + '>Feature on the home page</label>' +
          '<label class="chk"><input type="checkbox" id="f-hidden"' + (p.hidden ? ' checked' : '') + '>Hide from the shop</label></div>' +
        '</div></section>' +

        '<section class="panel"><h2>Photos</h2><p class="muted" style="margin:4px 0 14px;font-size:14px">The first photo is the shop thumbnail. Photos are resized automatically before uploading.</p>' +
          '<ul class="adm-photos" id="photos"></ul>' +
          '<label class="btn btn-ghost" style="margin-top:12px"><input type="file" id="f-files" accept="image/*" multiple class="sr-only">+ Add photos</label>' +
          '<span class="muted" id="up-status" role="status" style="margin-left:12px;font-size:14px"></span>' +
        '</section>' +

        '<section class="panel"><h2>Options buyers pick</h2>' +
          '<label class="chk"><input type="checkbox" name="opt" value="color"' + (has('color') ? ' checked' : '') + '>Filament color <span class="muted">(colors are set in Store settings)</span></label>' +
          '<label class="chk"><input type="checkbox" name="opt" value="size"' + (has('size') ? ' checked' : '') + '>Sizes, each with its own price</label>' +
          '<div id="w-size" class="sub"' + (has('size') ? '' : ' hidden') + '><label class="field-label" for="f-sizes">One per line as Name = Price</label><textarea id="f-sizes" class="inp" rows="3" placeholder="Standard = 14.99&#10;XL = 24.99">' + esc(sizesText) + '</textarea></div>' +
          '<label class="chk"><input type="checkbox" name="opt" value="letters"' + (has('letters') ? ' checked' : '') + '>Personalized letters (keychains)</label>' +
          '<div id="w-letters" class="sub admin-grid"' + (has('letters') ? '' : ' hidden') + '><div><label class="field-label" for="f-max">Max letters</label><input id="f-max" class="inp" type="number" min="1" max="8" value="' + ((p.letters && p.letters.max) || 6) + '"></div>' +
            '<div><label class="field-label" for="f-default">Example letters</label><input id="f-default" class="inp" value="' + esc((p.letters && p.letters.default) || 'ABC') + '"></div></div>' +
          '<label class="chk"><input type="checkbox" name="opt" value="theme"' + (has('theme') ? ' checked' : '') + '>Theme picker (keychains)</label>' +
          '<div style="margin-top:10px;max-width:320px"><label class="field-label" for="f-theme">Fixed theme (keychains)</label><select id="f-theme" class="inp"><option value="">None</option>' +
            themes.map((t) => '<option' + (t.name === p.fixedTheme ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></div>' +
        '</section>' +

        '<section class="panel"><h2>Details</h2><label class="field-label" for="f-specs" style="margin-top:12px">One per line as Label: Value</label>' +
          '<textarea id="f-specs" class="inp" rows="4" placeholder="Material: PLA&#10;Length: 6 in">' + esc(specsText) + '</textarea></section>' +

        '<div class="cta-row" style="justify-content:space-between">' +
          (isNew ? '<span></span>' : '<button type="button" class="btn btn-ghost danger" data-act="delete">Delete product</button>') +
          '<div class="cta-row"><a class="btn btn-ghost" href="#products">Cancel</a><button type="button" class="btn btn-accent" data-act="save">' + (isNew ? 'Publish product' : 'Save changes') + '</button></div>' +
        '</div>' +
      '</form>' +
      '<aside class="filters" aria-label="Shop card preview" style="position:sticky;top:90px"><p class="eyebrow" style="color:var(--muted)">Shop card preview</p><div id="preview"></div></aside></div>';

    const images = (p.images || []).slice();
    let idTouched = !isNew;
    const form = $('#ed');

    function drawPhotos() {
      $('#photos').innerHTML = images.length ? images.map((src, i) =>
        '<li><img src="' + esc(previews[src] || src) + '" alt="Photo ' + (i + 1) + '">' +
        '<div class="adm-photo-btns">' + (i ? '<button type="button" class="btn btn-ghost btn-sm" data-first="' + i + '">Make first</button>' : '<span class="tag tag-ok">Thumbnail</span>') +
        '<button type="button" class="btn btn-ghost btn-sm" data-rm="' + i + '" aria-label="Remove photo ' + (i + 1) + '">Remove</button></div></li>').join('') : '<li class="muted adm-nophoto">No photos yet.</li>';
    }
    function collect() {
      const v = (id) => ($('#' + id).value || '').trim();
      if (!idTouched) $('#f-id').value = slug(v('f-name'));
      const out = { id: v('f-id'), name: v('f-name'), category: v('f-cat') };
      const pr = v('f-price'); out.price = pr === '' ? null : Number(pr.replace(/[$,\s]/g, ''));
      if ($('#f-featured').checked) out.featured = true;
      if ($('#f-hidden').checked) out.hidden = true;
      if (v('f-badge')) out.badge = v('f-badge');
      out.description = $('#f-desc').value.trim();
      out.images = images.slice();
      out.options = $$('input[name=opt]:checked').map((i) => i.value);
      if (out.options.includes('letters')) out.letters = { max: Math.max(1, Math.min(8, parseInt(v('f-max'), 10) || 6)), default: v('f-default').toUpperCase().replace(/\s+/g, '') || 'ABC' };
      if (out.options.includes('size')) {
        out.sizes = $('#f-sizes').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [n, pz] = l.split('='); const num = parseFloat(String(pz || '').replace(/[$,\s]/g, ''));
          return { name: n.trim(), price: isFinite(num) ? num : null };
        });
      }
      if (v('f-theme')) out.fixedTheme = v('f-theme');
      const specs = {};
      $('#f-specs').value.split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) specs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      out.specs = specs;
      // keep anything else the product had that this form doesn't edit (e.g. designLink, preview)
      ['designLink', 'preview'].forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
      $('#w-size').hidden = !out.options.includes('size');
      $('#w-letters').hidden = !out.options.includes('letters');
      const card = Object.assign({}, out, { images: out.images.map((s) => previews[s] || s) });
      $('#preview').innerHTML = out.name ? site().cardHTML(data, card) : '<p class="muted" style="margin:0">Type a name to see the card.</p>';
      return out;
    }
    function problems(prod) {
      if (!prod.name) return 'Give the product a name.';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(prod.id)) return 'The page address can only use lowercase letters, numbers and dashes.';
      if (isNew && data.products.some((x) => x.id === prod.id)) return 'Another product already uses the page address “' + prod.id + '”. Change it slightly.';
      if (prod.price != null && !(isFinite(prod.price) && prod.price >= 0)) return 'The price should be a number, like 14.99.';
      if (prod.options.includes('size') && !(prod.sizes || []).length) return 'Add at least one size, or untick Sizes.';
      return '';
    }

    form.addEventListener('input', (e) => { if (e.target.id === 'f-id') idTouched = true; collect(); });
    form.addEventListener('change', collect);
    app().addEventListener('click', async function onClick(e) {
      if (!document.body.contains(form)) { app().removeEventListener('click', onClick); return; }
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.first != null) { const i = +b.dataset.first; images.unshift(images.splice(i, 1)[0]); drawPhotos(); collect(); }
      else if (b.dataset.rm != null) { images.splice(+b.dataset.rm, 1); drawPhotos(); collect(); }
      else if (b.dataset.act === 'save') {
        const prod = collect(); const err = problems(prod);
        if (err) { status(err, 'err'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        const next = JSON.parse(JSON.stringify(data));
        const i = next.products.findIndex((x) => x.id === (isNew ? '\u0000' : p.id));
        if (i >= 0) next.products[i] = prod; else next.products.push(prod);
        await save(next, (isNew ? 'Add product: ' : 'Edit product: ') + prod.name, prod.id);
      } else if (b.dataset.act === 'delete') {
        if (!window.confirm('Delete “' + p.name + '” from the store? This can’t be undone here. (Tip: “Hide from the shop” keeps it for later.)')) return;
        const next = JSON.parse(JSON.stringify(data));
        next.products = next.products.filter((x) => x.id !== p.id);
        await save(next, 'Delete product: ' + p.name, null);
      }
    });
    $('#f-files').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []); e.target.value = '';
      for (let n = 0; n < files.length; n++) {
        $('#up-status').textContent = 'Uploading photo ' + (n + 1) + ' of ' + files.length + '…';
        try {
          const shrunk = await shrink(files[n]);
          const res = await putJSON('/upload', { name: files[n].name, type: shrunk.type, data: shrunk.base64 }, 'POST');
          previews[res.path] = shrunk.url;
          images.push(res.path); drawPhotos(); collect();
        } catch (err) { status('Couldn’t upload ' + files[n].name + ': ' + err.message, 'err'); }
      }
      $('#up-status').textContent = files.length ? 'Uploaded. Remember to save.' : '';
    });
    drawPhotos(); collect();
  }

  // Resize to at most 1600px on the long side and re-encode as JPEG (keeps the repo small, strips camera location data).
  async function shrink(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error('that file isn’t a photo this browser can read');
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { type: 'image/jpeg', base64: btoa(s), url: URL.createObjectURL(blob) };
  }

  // ---------- store settings ----------
  function renderSettings() {
    const s = data.store, c = data.customDesign || {};
    const colors = ((data.options.color || {}).choices || []).map((x) => x.name + ' = ' + x.hex).join('\n');
    const val = (v) => (v == null ? '' : esc(v));
    app().innerHTML =
      '<div class="toolbar"><h1 class="h-lg" style="margin:0">Store settings</h1><button type="button" class="btn btn-accent" data-act="save-settings">Save settings</button></div>' +
      '<form id="st" novalidate>' +
      '<section class="panel"><h2>Banner</h2><p class="muted" style="margin:4px 0 14px;font-size:14px">Shows across the top of every page. Leave empty to hide it.</p>' +
        '<label class="field-label" for="s-banner">Banner text</label><input id="s-banner" class="inp" value="' + val(s.banner) + '"></section>' +
      '<section class="panel"><h2>Contact &amp; links</h2><div class="admin-grid" style="margin-top:14px">' +
        '<div><label class="field-label" for="s-email">Contact email</label><input id="s-email" class="inp" type="email" value="' + val(s.contactEmail) + '"></div>' +
        '<div><label class="field-label" for="s-etsy">Etsy shop link</label><input id="s-etsy" class="inp" type="url" placeholder="https://www.etsy.com/shop/…" value="' + val(s.etsyUrl) + '"></div>' +
      '</div></section>' +
      '<section class="panel"><h2>Shipping</h2><div class="admin-grid" style="margin-top:14px">' +
        '<div><label class="field-label" for="s-ship">Flat shipping price <span class="muted" style="font-weight:400">(blank = none)</span></label><input id="s-ship" class="inp" inputmode="decimal" value="' + val(s.shipping && s.shipping.price) + '"></div>' +
        '<div><label class="field-label" for="s-shipsin">Ships in</label><input id="s-shipsin" class="inp" placeholder="3–5 business days" value="' + val(s.shipsIn) + '"></div>' +
      '</div></section>' +
      '<section class="panel"><h2>Custom KeyCapForge designs</h2><p class="muted" style="margin:4px 0 14px;font-size:14px">Price = base + per key × number of keys. Leave blank to keep custom orders closed.</p><div class="admin-grid">' +
        '<div><label class="field-label" for="s-base">Base price</label><input id="s-base" class="inp" inputmode="decimal" value="' + val(c.basePrice) + '"></div>' +
        '<div><label class="field-label" for="s-perkey">Per key</label><input id="s-perkey" class="inp" inputmode="decimal" value="' + val(c.perKey) + '"></div>' +
        '<div><label class="field-label" for="s-maxkeys">Most keys allowed</label><input id="s-maxkeys" class="inp" type="number" min="1" max="20" value="' + val(c.maxKeys || 8) + '"></div>' +
      '</div></section>' +
      '<section class="panel"><h2>Filament colors</h2><p class="muted" style="margin:4px 0 14px;font-size:14px">The colors buyers can pick. One per line as Name = #hexcolor.</p>' +
        '<label class="field-label sr-only" for="s-colors">Filament colors</label><textarea id="s-colors" class="inp" rows="8">' + esc(colors) + '</textarea></section>' +
      '<div class="cta-row" style="justify-content:flex-end"><button type="button" class="btn btn-accent" data-act="save-settings">Save settings</button></div>' +
      '</form>';
    app().querySelectorAll('[data-act=save-settings]').forEach((b) => b.addEventListener('click', async () => {
      const v = (id) => ($('#' + id).value || '').trim();
      const num = (id) => { const t = v(id).replace(/[$,\s]/g, ''); return t === '' ? null : Number(t); };
      for (const id of ['s-ship', 's-base', 's-perkey']) { const n = num(id); if (n != null && !(isFinite(n) && n >= 0)) { status('Prices should be numbers, like 4.99.', 'err'); return; } }
      const lines = v('s-colors').split('\n').map((l) => l.trim()).filter(Boolean);
      const choices = [];
      for (const l of lines) {
        const [name, hex] = l.split('=').map((x) => (x || '').trim());
        if (!name || !/^(#[0-9a-fA-F]{3,8}|linear-gradient\([^;{}<>]*\))$/.test(hex || '')) { status('Check the color line “' + l + '”. It should look like Black = #16181D.', 'err'); return; }
        choices.push({ name, hex });
      }
      const next = JSON.parse(JSON.stringify(data));
      Object.assign(next.store, { banner: v('s-banner'), contactEmail: v('s-email'), etsyUrl: v('s-etsy'), shipsIn: v('s-shipsin') });
      next.store.shipping = Object.assign({ name: 'Shipping' }, next.store.shipping || {}, { price: num('s-ship') });
      next.customDesign = Object.assign({}, next.customDesign || {}, { basePrice: num('s-base'), perKey: num('s-perkey'), maxKeys: Math.max(1, parseInt(v('s-maxkeys'), 10) || 8) });
      next.options.color = Object.assign({ label: 'Color' }, next.options.color || {}, { choices });
      await save(next, 'Update store settings', 'settings');
    }));
  }

  // ---------- save ----------
  async function save(next, message, after) {
    status('Saving…');
    $$('button[data-act]').forEach((b) => { b.disabled = true; });
    try {
      const res = await putJSON('/content', { data: next, sha, message });
      data = next; sha = res.sha;
      if (after === 'settings') { renderSettings(); }
      else { history.pushState(null, '', after ? '#edit=' + encodeURIComponent(after) : '#products'); route(); }
      status('Saved. The live site updates in about a minute.', 'ok');
    } catch (err) {
      if (err.status === 401) { setFlag(false); status('You’ve been signed out. Sign in again to save — your changes on this page are still here.', 'err'); app().insertAdjacentHTML('afterbegin', signInCard()); }
      else status('Not saved: ' + err.message, 'err');
      $$('button[data-act]').forEach((b) => { b.disabled = false; });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#signOut').addEventListener('click', async () => {
      try { await putJSON('/auth/logout', {}, 'POST'); } catch (e) { /* ignore */ }
      setFlag(false); location.href = 'index.html';
    });
    start().catch((e) => { app().innerHTML = notSetUp(esc(e.message)); });
  });
})();
