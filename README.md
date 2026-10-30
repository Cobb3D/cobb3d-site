# Cobb3D Printing website

A complete storefront for Cobb3D: home page, shop, a product page that builds itself for every product, a cart, Square checkout, and KeyCapForge built in. Plain HTML/CSS/JS, so there's nothing to compile and it hosts free.

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | Home page |
| `shop.html` | All products, with category tabs, search and sorting |
| `product.html` | The one product template. `product.html?id=articulated-fidget-dragon` shows that product |
| `designer.html` | KeyCapForge plus an "Order your design" panel |
| `cart.html` / `thanks.html` | Cart, and the page Square sends people back to after paying |
| `add-product.html` | Your helper for adding products (not linked from the site) |
| `products.json` | **Every product, price, category and option lives here** |
| `css/site.css`, `js/site.js` | Styles and the shared script |
| `checkout-worker/` | The small piece that talks to Square (see step 3) |

## 1. Fill in your store

Open `products.json` and set:

- `store.contactEmail`, `store.etsyUrl` (each shows up in the footer once filled in), and `store.shipsIn`.
- `store.shipping.price` for a flat shipping charge, or leave it `null`.
- A `price` on each product. **Any product with `"price": null` shows "Coming soon" and can't be bought.** Products with sizes get their price from each size instead.
- `customDesign.basePrice` and `customDesign.perKey` for orders made in KeyCapForge (price = base + per key × number of keys).
- Replace the `[BRACKETED]` placeholders (names, materials, dimensions).
- Add or remove filament colors under `options.color`.

## 2. Add products

1. Put the photos in an `images/` folder.
2. Open `add-product.html` on your site (or locally) and fill in the form. The shop card preview updates as you type.
3. Press **Download updated products.json** and replace the old file with it.

That creates the product page and the shop card automatically. To hide a product without deleting it, add `"hidden": true`.

## 3. Turn on Square checkout

The cart sends people to a secure Square checkout page. Card details never touch your site.

1. Sign in at developer.squareup.com, create an application, and copy the **Sandbox access token** and a **Location ID**.
2. Create a free Cloudflare account, then go to **Workers & Pages → Create → Worker**. Paste in `checkout-worker/worker.js` and deploy.
3. Under the worker's **Settings → Variables**, add:
   - `SQUARE_ACCESS_TOKEN`: the token, saved as a **secret**
   - `SQUARE_LOCATION_ID`
   - `SQUARE_ENV`: `sandbox`
   - `SITE_URL`: `https://cobb3dprinting.com`
   - Optional: `TAX_PERCENT` (for example `5.5`) and `SHIPPING_FLAT`
4. Copy the worker's address (`https://cobb3d-checkout.<you>.workers.dev`) into `store.checkoutEndpoint` in `products.json`.
5. Place a test order using Square's sandbox test card. When it works, switch to your **production** token and set `SQUARE_ENV` to `production`.

The worker looks up prices in your live `products.json`, so nobody can change a price in their browser. Orders, with each buyer's letters, color, size and design notes, show up in your Square Dashboard alongside your in-person sales.

## 4. Put it online (free)

**GitHub Pages:** create a repo (for example `cobb3d-site`) and upload everything in this folder. Then go to **Settings → Pages → Deploy from branch → main / root**.

**Cloudflare Pages** works the same way: connect the repo, with no build command.

### Connecting cobb3dprinting.com

The `CNAME` file in this folder already tells GitHub Pages the site's address is `cobb3dprinting.com`.

In **Cloudflare → cobb3dprinting.com → DNS → Records**, add these records with **Proxy status: DNS only** (grey cloud):

| Type | Name | Content |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `cobb3d.github.io` |
| CNAME | `design` | `cobb3d.github.io` |

Then:

1. In the site repo, go to **Settings → Pages → Custom domain**, enter `cobb3dprinting.com` and save. When the DNS check passes, tick **Enforce HTTPS**. The certificate can take up to an hour.
2. In the **KeyCapForgeWeb** repo, set its Custom domain to `design.cobb3dprinting.com` the same way. The old `cobb3d.github.io/KeyCapForgeWeb` link redirects there automatically.
3. Recommended: in your GitHub profile, go to **Settings → Pages → Add a domain** and verify `cobb3dprinting.com`. This stops anyone else from pointing a GitHub site at your domain.

`products.json` already points the designer at `https://design.cobb3dprinting.com/`, so finish step 2 before you publish this version, or the Design page will be blank until you do.

## 5. One-click "Add design to cart" from KeyCapForge

`designer.html` already listens for designs from KeyCapForge. Until the app sends them, customers set the key count and notes by hand. To make it automatic, add this to KeyCapForgeWeb wherever you can read the current design (for example, after each change):

```js
if (window.parent !== window) {
  window.parent.postMessage({
    type: 'keycapforge:design',
    design: JSON.stringify(currentDesignSettings), // or a share link
    keys: numberOfCaps
  }, '*');
}
```

The site only accepts these messages from the address in `store.designerUrl`. Designs land in the Square order note, so you can rebuild the 3MF from them.

## Making sure visitors see your changes

Browsers (Safari especially) hold on to old copies of `css/site.css` and `js/site.js`. Every page loads them as `site.css?v=2026103002` and `site.js?v=2026103002`. After you change either file, change that number in all the pages (VS Code: **Edit → Replace in Files**, `v=2026103002` → a new number such as today's date), so browsers fetch the new version straight away.

## Notes

- To preview locally, run `python3 -m http.server` in this folder and open http://localhost:8000. Opening the files directly won't load `products.json`.
- The cart is kept in the visitor's browser and clears after a successful checkout.
