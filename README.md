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
| `admin.html`, `js/admin.js` | Owner admin dashboard: products, photos, store settings (see “Owner admin”) |
| `products.json` | **Every product, price, category and option lives here** |
| `css/site.css`, `js/site.js` | Styles and the shared script |
| `checkout-worker/` | The small piece that talks to Square (see step 2) |
| `admin-worker/` | The sign-in and save service behind the admin dashboard |

## 1. Owner admin (add and edit content from the website)

Go to **cobb3dprinting.com/admin.html** (there's also an “Owner login” link in the footer) and sign in with your GitHub account. From there you can:

- **Products:** add, edit, hide or delete products, set prices, sizes, colors and letter options, and upload photos straight from your Mac or phone.
- **Store settings:** banner text, contact email, Etsy link, shipping price, ship time, custom KeyCapForge design prices and filament colors.

While you're signed in, an **owner bar** appears at the top of every page of the site, with **Edit this product** on product pages. Visitors never see it.

Every save is committed to the `cobb3d-site` repo on GitHub, and the live site updates about a minute later. Photos are resized to 1600px and saved in `images/products/`. Product prices left blank show “Coming soon” and can't be bought.

### One-time setup (about 15 minutes)

Only the GitHub accounts you list can sign in. The admin service runs free on Cloudflare at `api.cobb3dprinting.com`.

1. **GitHub sign-in app.** On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - Application name: `Cobb3D admin`
   - Homepage URL: `https://cobb3dprinting.com`
   - Authorization callback URL: `https://api.cobb3dprinting.com/auth/callback`

   Register it, copy the **Client ID**, then click **Generate a new client secret** and copy that too.
2. **Save token.** Go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:
   - Repository access: **Only select repositories → cobb3d-site**
   - Permissions → Repository permissions → **Contents: Read and write**
   - Expiration: up to a year. GitHub emails you before it runs out; make a new one and paste it in step 4.
3. **Create the worker.** In Cloudflare, go to **Workers & Pages → Create → Create Worker**, name it `cobb3d-admin`, deploy, then **Edit code**. Replace everything with `admin-worker/worker.js` and click **Deploy**.
4. **Settings.** In the worker, go to **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   |---|---|---|
   | `SITE_URL` | Text | `https://cobb3dprinting.com` |
   | `REPO` | Text | `Cobb3D/cobb3d-site` |
   | `BRANCH` | Text | `main` |
   | `ALLOWED_LOGINS` | Text | `Cobb3D` (your GitHub username; separate several with commas) |
   | `GITHUB_CLIENT_ID` | Text | the Client ID from step 1 |
   | `GITHUB_CLIENT_SECRET` | **Secret** | the client secret from step 1 |
   | `GITHUB_TOKEN` | **Secret** | the token from step 2 |
   | `SESSION_SECRET` | **Secret** | a long random string, at least 32 characters (a password manager can make one) |

5. **Address.** In the worker, go to **Settings → Domains & Routes → Add → Custom domain** and enter `api.cobb3dprinting.com`. Cloudflare creates the DNS record itself.
6. Open **cobb3dprinting.com/admin.html** and click **Sign in with GitHub**.

`products.json` already points the dashboard at `https://api.cobb3dprinting.com` (`store.adminApi`).

**Security notes:** the secrets live only in Cloudflare, never in this repo. Sign-in only proves who you are; saving uses the repo-only token. Saves are only accepted from cobb3dprinting.com pages. To lock someone out, remove them from `ALLOWED_LOGINS`; to sign out everywhere, change `SESSION_SECRET`.

### Editing by hand

You can still edit `products.json` directly in VS Code or on github.com. If the dashboard says the store “was changed somewhere else,” reload the dashboard to pick up the newer version.

## 2. Turn on Square checkout

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

## 3. Put it online (free)

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

## 4. One-click "Add design to cart" from KeyCapForge

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

Browsers (Safari especially) hold on to old copies of `css/site.css` and `js/site.js`. Every page loads them as `site.css?v=2026103003` and `site.js?v=2026103003`. After you change either file, change that number in all the pages (VS Code: **Edit → Replace in Files**, `v=2026103003` → a new number such as today's date), so browsers fetch the new version straight away.

## Notes

- To preview locally, run `python3 -m http.server` in this folder and open http://localhost:8000. Opening the files directly won't load `products.json`.
- The cart is kept in the visitor's browser and clears after a successful checkout.
