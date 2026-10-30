/**
 * Cobb3D admin service — a Cloudflare Worker at https://api.cobb3dprinting.com
 *
 * What it does:
 *   - "Sign in with GitHub", and only lets in the GitHub accounts listed in ALLOWED_LOGINS.
 *   - Keeps you signed in with a signed, HttpOnly cookie (30 days).
 *   - Reads and saves the site's products.json, and uploads product photos,
 *     by committing to the cobb3d-site GitHub repo. GitHub Pages then republishes.
 *
 * Settings (Cloudflare → Workers & Pages → cobb3d-admin → Settings → Variables and Secrets):
 *   SITE_URL             https://cobb3dprinting.com            (text)
 *   REPO                 Cobb3D/cobb3d-site                    (text)
 *   BRANCH               main                                  (text)
 *   ALLOWED_LOGINS       Cobb3D                                (text; comma-separated GitHub usernames)
 *   GITHUB_CLIENT_ID     from your GitHub OAuth App             (text)
 *   GITHUB_CLIENT_SECRET from your GitHub OAuth App             (secret)
 *   GITHUB_TOKEN         fine-grained token: cobb3d-site only, Contents read & write (secret)
 *   SESSION_SECRET       any long random string                (secret)
 */

const GH_API = 'https://api.github.com';
const SESSION_COOKIE = 'c3_session';
const STATE_COOKIE = 'c3_state';
const SESSION_DAYS = 30;
const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const siteOrigin = new URL(env.SITE_URL).origin;
    const cors = {
      'Access-Control-Allow-Origin': siteOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      // ----- sign in / out -----
      if (url.pathname === '/auth/login' && request.method === 'GET') return login(url, env);
      if (url.pathname === '/auth/callback' && request.method === 'GET') return await callback(url, request, env, siteOrigin);
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        requireSameSite(request, siteOrigin);
        return json({ ok: true }, 200, cors, [cookie(SESSION_COOKIE, '', 0, '/')]);
      }

      // ----- everything below needs a signed-in admin -----
      const who = await readSession(request, env);
      if (url.pathname === '/me' && request.method === 'GET') {
        return who ? json({ login: who }, 200, cors) : json({ error: 'Not signed in' }, 401, cors);
      }
      if (!who) return json({ error: 'Not signed in' }, 401, cors);

      if (url.pathname === '/content' && request.method === 'GET') {
        const file = await ghGetFile(env, 'products.json');
        return json({ data: JSON.parse(file.text), sha: file.sha }, 200, cors);
      }
      if (url.pathname === '/content' && request.method === 'PUT') {
        requireSameSite(request, siteOrigin);
        const body = await readJson(request, MAX_JSON_BYTES);
        validateStore(body.data);
        const text = JSON.stringify(body.data, null, 2) + '\n';
        const message = cleanMessage(body.message) || 'Update store content';
        const res = await ghPutFile(env, 'products.json', text, message + ' (via admin, ' + who + ')', body.sha);
        return json({ ok: true, sha: res.content.sha }, 200, cors);
      }
      if (url.pathname === '/upload' && request.method === 'POST') {
        requireSameSite(request, siteOrigin);
        const body = await readJson(request, Math.ceil(MAX_IMAGE_BYTES * 1.4) + 10_000);
        const ext = IMAGE_TYPES[body.type];
        if (!ext) throw httpError('Photos must be JPEG, PNG or WebP', 400);
        if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(body.data)) throw httpError('Bad photo data', 400);
        if (body.data.length * 0.75 > MAX_IMAGE_BYTES) throw httpError('Photo is too large (8 MB max)', 413);
        const stem = String(body.name || 'photo').toLowerCase().replace(/\.[a-z0-9]+$/, '')
          .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = crypto.randomUUID().slice(0, 6);
        const path = 'images/products/' + stamp + '-' + stem + '-' + rand + '.' + ext;
        await ghPutFile(env, path, null, 'Add product photo ' + path + ' (via admin, ' + who + ')', undefined, body.data);
        return json({ ok: true, path }, 200, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err && err.stack || err);
      return json({ error: status === 500 ? 'Something went wrong' : err.message }, status, cors);
    }
  },
};

// ---------- GitHub sign-in ----------
function login(url, env) {
  const state = crypto.randomUUID();
  const ret = safeReturn(url.searchParams.get('return'));
  const auth = new URL('https://github.com/login/oauth/authorize');
  auth.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  auth.searchParams.set('redirect_uri', url.origin + '/auth/callback');
  auth.searchParams.set('state', state);
  auth.searchParams.set('allow_signup', 'false');
  // No scope requested: we only need to know who you are.
  return new Response(null, {
    status: 302,
    headers: [['Location', auth.toString()], ['Set-Cookie', cookie(STATE_COOKIE, state + '|' + ret, 600, '/auth')]],
  });
}

async function callback(url, request, env, siteOrigin) {
  const saved = getCookie(request, STATE_COOKIE) || '';
  const [state, ret] = [saved.split('|')[0], safeReturn(saved.split('|').slice(1).join('|'))];
  if (!state || state !== url.searchParams.get('state')) return page('Sign-in expired', 'Please go back to the site and sign in again.', siteOrigin, 400);

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: url.origin + '/auth/callback' }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tok.access_token) return page('Sign-in failed', 'GitHub did not confirm the sign-in. Please try again.', siteOrigin, 400);

  const userRes = await fetch(GH_API + '/user', { headers: ghHeaders(tok.access_token) });
  const user = await userRes.json().catch(() => ({}));
  const allowed = String(env.ALLOWED_LOGINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user.login || !allowed.includes(String(user.login).toLowerCase())) {
    return page('Not an admin account', 'This GitHub account is not allowed to manage the store.', siteOrigin, 403);
  }
  const session = await signSession(user.login, env);
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', siteOrigin + ret],
      ['Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400, '/')],
      ['Set-Cookie', cookie(STATE_COOKIE, '', 0, '/auth')],
    ],
  });
}

function safeReturn(r) {
  return typeof r === 'string' && /^\/(?!\/)[A-Za-z0-9_\-./?=&#%]*$/.test(r) ? r : '/admin.html';
}

// ---------- session (HMAC-signed cookie) ----------
async function hmacKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 24) throw new Error('SESSION_SECRET is missing or too short');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(login, env) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ l: login, e: Date.now() + SESSION_DAYS * 86400000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(payload));
  return payload + '.' + b64url(new Uint8Array(sig));
}
async function readSession(request, env) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(sig), new TextEncoder().encode(payload)).catch(() => false);
  if (!ok) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (e) { return null; }
  if (!data || typeof data.l !== 'string' || !(data.e > Date.now())) return null;
  const allowed = String(env.ALLOWED_LOGINS || '').split(',').map((s) => s.trim().toLowerCase());
  return allowed.includes(data.l.toLowerCase()) ? data.l : null;
}
function requireSameSite(request, siteOrigin) {
  // Writes only from the site itself (blocks other websites from posting with your cookie).
  if (request.headers.get('Origin') !== siteOrigin) throw httpError('Not allowed from this page', 403);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw httpError('Bad request', 400);
}

// ---------- GitHub contents API ----------
function ghHeaders(token) {
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'cobb3d-admin', 'X-GitHub-Api-Version': '2022-11-28' };
}
async function ghGetFile(env, path) {
  const res = await fetch(GH_API + '/repos/' + env.REPO + '/contents/' + path + '?ref=' + encodeURIComponent(env.BRANCH || 'main'), { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (!res.ok) throw httpError('Could not read ' + path + ' from GitHub (' + res.status + ')', 502);
  const data = await res.json();
  const bytes = unb64(data.content.replace(/\n/g, ''));
  return { sha: data.sha, text: new TextDecoder().decode(bytes) };
}
async function ghPutFile(env, path, text, message, sha, base64) {
  const body = { message, branch: env.BRANCH || 'main', content: base64 || b64(new TextEncoder().encode(text)) };
  if (sha) body.sha = sha;
  const res = await fetch(GH_API + '/repos/' + env.REPO + '/contents/' + path, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(env.GITHUB_TOKEN)), body: JSON.stringify(body) });
  if (res.status === 409 || (res.status === 422 && sha)) throw httpError('The store was changed somewhere else. Reload the admin page and try again.', 409);
  if (!res.ok) throw httpError('GitHub would not save the change (' + res.status + ')', 502);
  return res.json();
}

// ---------- checks ----------
function validateStore(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw httpError('Store data is missing', 400);
  if (!d.store || typeof d.store !== 'object') throw httpError('Store settings are missing', 400);
  if (!Array.isArray(d.categories) || !Array.isArray(d.products)) throw httpError('Products or categories are missing', 400);
  const ids = new Set();
  for (const p of d.products) {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id)) throw httpError('Each product needs a page address made of lowercase letters, numbers and dashes', 400);
    if (ids.has(p.id)) throw httpError('Two products share the address "' + p.id + '"', 400);
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) throw httpError('Every product needs a name', 400);
    if (p.price != null && !(typeof p.price === 'number' && p.price >= 0 && p.price < 100000)) throw httpError('Price for "' + p.name + '" is not a valid number', 400);
    for (const img of p.images || []) {
      if (typeof img !== 'string' || !/^(images\/[A-Za-z0-9_\-./]+|https:\/\/[^\s"'<>]+)$/.test(img) || img.includes('..')) throw httpError('A photo path for "' + p.name + '" is not allowed', 400);
    }
  }
}
function cleanMessage(m) { return typeof m === 'string' ? m.replace(/[\r\n]+/g, ' ').slice(0, 120).trim() : ''; }

// ---------- small helpers ----------
async function readJson(request, limit) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > limit) throw httpError('Too large', 413);
  const text = await request.text();
  if (text.length > limit) throw httpError('Too large', 413);
  try { return JSON.parse(text); } catch (e) { throw httpError('Bad request', 400); }
}
function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function cookie(name, value, maxAge, path) {
  return name + '=' + encodeURIComponent(value) + '; Path=' + path + '; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return unb64(s); }
function httpError(msg, status) { const e = new Error(msg); e.status = status; return e; }
function json(obj, status, headers, cookies) {
  const h = new Headers(Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers));
  (cookies || []).forEach((c) => h.append('Set-Cookie', c));
  return new Response(JSON.stringify(obj), { status, headers: h });
}
function page(title, text, siteOrigin, status) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) +
    '</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 24px;line-height:1.5"><h1>' + esc(title) + '</h1><p>' + esc(text) +
    '</p><p><a href="' + esc(siteOrigin) + '/admin.html">Back to Cobb3D admin</a></p></body>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
