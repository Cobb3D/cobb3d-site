/* Cookie cutter page: the bits of the main site it shares (cart count, site-wide banner).
   Kept separate from js/site.js because the cutter page has its own styles and light/dark switch. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  try {
    var items = JSON.parse(localStorage.getItem('cobb3d-cart-v1') || '[]');
    var n = Array.isArray(items) ? items.reduce(function (a, i) { return a + (i.qty || 0); }, 0) : 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-count]'), function (el) { el.textContent = n; });
  } catch (e) { /* storage blocked */ }
  fetch('products.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var text = d && d.store && d.store.banner;
    if (!text || document.querySelector('.site-banner')) return;
    document.body.insertAdjacentHTML('afterbegin', '<div class="site-banner" role="status"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg><span>' + esc(text) + '</span></div>');
  }).catch(function () { /* banner is optional */ });
})();
