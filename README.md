# Cobb3D Printing website

The storefront for Cobb3D Printing: home page, shop, a product page that builds itself for every product, a cart, and the KeyCapForge designer. Plain HTML/CSS/JS, with no build step.

© Cobb3D Printing. All rights reserved.

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | Home page |
| `shop.html` | All products, with category tabs, search and sorting |
| `product.html` | The one product template (`product.html?id=…`) |
| `designer.html` | The KeyCapForge designer with an order panel |
| `cart.html` / `thanks.html` | Cart, and the after-checkout page |
| `products.json` | Products, prices, categories and store settings |
| `css/site.css`, `js/site.js` | Styles and the shared script |
| `checkout-worker/`, `admin-worker/` | Small server-side helpers. Their settings and keys are kept outside this repo. |

## Previewing locally

Run `python3 -m http.server` in this folder and open http://localhost:8000. Opening the files directly won't load `products.json`.

## After editing `css/site.css` or `js/site.js`

Every page loads them with a version number (`?v=…`). Change that number in all the pages so browsers pick up the new files right away.
