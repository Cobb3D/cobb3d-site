/**
 * Cobb3D checkout — a Cloudflare Worker that turns the site's cart into a Square checkout page.
 *
 * Why a worker: your Square access token must stay secret, so it can't live in the website.
 * The browser sends only product ids + chosen options; prices are looked up here from your
 * live products.json, so nobody can change a price in their browser.
 *
 * Settings (Cloudflare dashboard → Worker → Settings → Variables):
 *   SQUARE_ACCESS_TOKEN  (secret)  your Square access token (sandbox or production)
 *   SQUARE_LOCATION_ID             the Square location orders should go to
 *   SQUARE_ENV                     "sandbox" while testing, "production" when live
 *   SITE_URL                       e.g. https://cobb3d.com  (no trailing slash)
 *   SHIPPING_FLAT                  optional, e.g. "4.99" — overrides products.json shipping price
 *   TAX_PERCENT                    optional, e.g. "5.5" — adds a sales tax line
 */

const MAX_NOTE = 1900; // Square limits line-item notes to 2000 characters

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.SITE_URL ? new URL(env.SITE_URL).origin : '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405, cors);

    try {
      const body = await request.json();
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) return json({ error: 'Your cart is empty' }, 400, cors);

      const catalog = await loadCatalog(env);
      const lineItems = items.map((item) => toLineItem(item, catalog));

      const currency = (catalog.store && catalog.store.currency) || 'USD';
      const order = {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems.map((li) => ({
          name: li.name,
          quantity: String(li.qty),
          base_price_money: { amount: li.cents, currency },
          note: li.note || undefined,
        })),
      };
      const tax = parseFloat(env.TAX_PERCENT || '');
      if (isFinite(tax) && tax > 0) {
        order.taxes = [{ uid: 'sales-tax', name: 'Sales tax', percentage: String(tax), scope: 'ORDER' }];
      }

      const checkout_options = {
        ask_for_shipping_address: true,
        redirect_url: (env.SITE_URL || '') + '/thanks.html',
      };
      const shipPrice = env.SHIPPING_FLAT != null && env.SHIPPING_FLAT !== ''
        ? parseFloat(env.SHIPPING_FLAT)
        : catalog.store && catalog.store.shipping && catalog.store.shipping.price;
      if (typeof shipPrice === 'number' && isFinite(shipPrice) && shipPrice > 0) {
        checkout_options.shipping_fee = {
          name: (catalog.store.shipping && catalog.store.shipping.name) || 'Shipping',
          charge: { amount: Math.round(shipPrice * 100), currency },
        };
      }

      const base = env.SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
      const res = await fetch(base + '/v2/online-checkout/payment-links', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.SQUARE_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idempotency_key: crypto.randomUUID(), order, checkout_options }),
      });
      const data = await res.json();
      if (!res.ok || !data.payment_link) {
        console.error('Square error', JSON.stringify(data.errors || data));
        return json({ error: 'Checkout is unavailable right now' }, 502, cors);
      }
      return json({ url: data.payment_link.url }, 200, cors);
    } catch (err) {
      return json({ error: err.message || 'Something went wrong' }, err.status || 500, cors);
    }
  },
};

let cached = null, cachedAt = 0;
async function loadCatalog(env) {
  if (cached && Date.now() - cachedAt < 60_000) return cached;
  const res = await fetch((env.SITE_URL || '') + '/products.json', { cf: { cacheTtl: 60 } });
  if (!res.ok) throw httpError('Could not load products', 500);
  cached = await res.json();
  cachedAt = Date.now();
  return cached;
}

function toLineItem(item, catalog) {
  const qty = clampInt(item.qty, 1, 99);
  const opts = item.opts && typeof item.opts === 'object' ? item.opts : {};
  const o = catalog.options || {};
  const notes = [];

  if (opts.switch != null) {
    if (!((o.switch && o.switch.choices) || []).includes(opts.switch)) throw httpError('Unknown switch option', 400);
    notes.push('Switch: ' + opts.switch);
  }

  if (item.id === '__custom__') {
    const c = catalog.customDesign || {};
    if (!isNum(c.basePrice) || !isNum(c.perKey)) throw httpError('Custom designs are not for sale yet', 400);
    const custom = item.custom || {};
    const keys = clampInt(custom.keys, 1, c.maxKeys || 8);
    notes.unshift(keys + (keys === 1 ? ' key' : ' keys'));
    if (custom.notes) notes.push('Notes: ' + String(custom.notes).slice(0, 400));
    if (custom.design) notes.push('Design: ' + String(custom.design));
    return { name: c.name || 'Custom KeyCapForge design', qty, cents: toCents(c.basePrice + c.perKey * keys), note: fitNote(notes) };
  }

  const p = (catalog.products || []).find((x) => x.id === item.id && !x.hidden);
  if (!p) throw httpError('An item in your cart is no longer available', 400);
  const allowed = p.options || [];
  let price = p.price;

  if (opts.size != null) {
    const sz = allowed.includes('size') && (p.sizes || []).find((z) => z.name === opts.size);
    if (!sz) throw httpError('Unknown size for ' + p.name, 400);
    if (isNum(sz.price)) price = sz.price;
    notes.unshift('Size: ' + sz.name);
  }
  if (opts.color != null) {
    if (!allowed.includes('color') || !((o.color && o.color.choices) || []).some((c) => c.name === opts.color)) throw httpError('Unknown color for ' + p.name, 400);
    notes.push('Color: ' + opts.color);
  }
  if (opts.theme != null) {
    const ok = p.fixedTheme ? opts.theme === p.fixedTheme : allowed.includes('theme') && ((o.theme && o.theme.choices) || []).some((t) => t.name === opts.theme);
    if (!ok) throw httpError('Unknown theme for ' + p.name, 400);
    notes.push('Theme: ' + opts.theme);
  }
  if (opts.letters != null) {
    const max = (p.letters && p.letters.max) || 6;
    const letters = String(opts.letters).toUpperCase().replace(/\s+/g, '');
    if (!allowed.includes('letters') || !letters || [...letters].length > max) throw httpError('Letters must be 1–' + max + ' characters', 400);
    notes.unshift('Letters: ' + letters);
  }
  if (!isNum(price)) throw httpError(p.name + ' is not for sale yet', 400);
  return { name: p.name, qty, cents: toCents(price), note: fitNote(notes) };
}

function fitNote(parts) {
  const s = parts.join(' | ');
  if (s.length <= MAX_NOTE) return s;
  return s.slice(0, MAX_NOTE - 40) + ' …[design cut off — ask customer for file]';
}
const isNum = (n) => typeof n === 'number' && isFinite(n);
const toCents = (n) => Math.round(n * 100);
function clampInt(v, lo, hi) { const n = parseInt(v, 10); return Math.max(lo, Math.min(hi, isFinite(n) ? n : lo)); }
function httpError(msg, status) { const e = new Error(msg); e.status = status; return e; }
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
}
