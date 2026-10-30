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
   - `SITE_URL`: your site's address, for example `https://cobb3d.github.io/cobb3d-site`
   - Optional: `TAX_PERCENT` (for example `5.5`) and `SHIPPING_FLAT`
4. Copy the worker's address (`https://cobb3d-checkout.<you>.workers.dev`) into `store.checkoutEndpoint` in `products.json`.
5. Place a test order using Square's sandbox test card. When it works, switch to your **production** token and set `SQUARE_ENV` to `production`.

The worker looks up prices in your live `products.json`, so nobody can change a price in their browser. Orders, with each buyer's letters, color, size, switch and design notes, show up in your Square Dashboard alongside your in-person sales.

## 4. Put it online (free)

**GitHub Pages:** create a repo (for example `cobb3d-site`) and upload everything in this folder. Then go to **Settings → Pages → Deploy from branch → main / root**.

**Cloudflare Pages** works the same way: connect the repo, with no build command.

To use your own domain, add it under Settings → Pages → Custom domain, then update `SITE_URL` in the worker.

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

## Notes

- To preview locally, run `python3 -m http.server` in this folder and open http://localhost:8000. Opening the files directly won't load `products.json`.
- The cart is kept in the visitor's browser and clears after a successful checkout.
