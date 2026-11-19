# smugless

An open-source photo portfolio website with a built-in admin for managing your galleries. It runs on your own Cloudflare account: one Worker, one private R2 bucket, and Cloudflare Images for resizing. There's no build step and no database, and it fits in the free tiers for a typical portfolio.

**Live demo:** https://smugless.kuril.in (photos from Unsplash; the photographer is fictional)

## Features

**Public site**
- Galleries as justified photo grids, with a full-screen lightbox (swipe, pinch-zoom, captions). Gallery pages show just the photos; titles and descriptions feed search results and link previews.
- A home page that shows either a grid of all galleries or one gallery of your choice.
- An optional About page with a portrait, a bio and a contact email.
- Responsive images in AVIF and WebP at five widths, generated on first request and cached. Resized copies carry no EXIF data, GPS included.
- Light and dark themes that follow the visitor's system setting.

**Admin** (`/admin`, password-protected)
- Create, rename, reorder and delete galleries.
- Drag and drop photos to upload (JPEG, PNG, WebP, AVIF up to 100 MB), drag to reorder, add captions, pick a cover, move photos between galleries.
- Edit the site title, tagline, home page and About page.
- Every change saves automatically and is live immediately.

## Deploy your own

You need a Cloudflare account and Node.js.

```bash
git clone https://github.com/akurilin/smugless.git && cd smugless
npm install
npx wrangler login
npx wrangler r2 bucket create smugless-photos
npm run deploy
openssl rand -base64 18 | tr -d '\n' | tee .admin-password | npx wrangler secret put ADMIN_PASSWORD
```

Then open `https://smugless.<your-subdomain>.workers.dev/login`, sign in with the password in `.admin-password` (git-ignored), and start adding galleries.

To try it with sample content first, seed it with Unsplash photos:

```bash
SMUGLESS_URL=https://smugless.<your-subdomain>.workers.dev SMUGLESS_PASSWORD="$(cat .admin-password)" node scripts/seed.mjs
```

**Custom domain:** if the domain's DNS is on Cloudflare, add a `routes` entry with `custom_domain: true` to `wrangler.jsonc`; Cloudflare's edge cache then also serves images and pages without invoking the Worker. If the DNS is elsewhere, see how the demo does it below.

## How it works

```
R2 bucket smugless-photos (private)
  manifest.json            galleries, order, titles, captions, About page: the whole site
  originals/<id>           uploaded files, never served directly
  derived/<id>/<w>.<fmt>   resized copies, made on first request
  trash/<id>               originals of deleted photos
```

- `GET /img/<id>/<width>.<avif|webp|jpg>` serves `derived/` if present; otherwise it resizes the original with the Images binding, saves it to `derived/`, and serves it. Widths are fixed at 400/800/1200/1600/2400, so each photo produces at most 15 transformations.
- Pages render on each request from `manifest.json`, so changes are live immediately.
- The admin page holds the manifest in memory and PUTs the whole thing back. The server validates it (unique, non-reserved URLs; every photo used once).
- Signing in sets a 30-day session cookie signed with the admin password, so changing the password signs everyone out. Scripts can skip the login page by sending the password via HTTP Basic auth (any username), as `scripts/seed.mjs` does.

Code: `src/index.ts` (routes), `src/images.ts`, `src/manifest.ts`, `src/views.ts`, `src/auth.ts`; browser code in `public/static/`.

## Commands

```bash
npm run deploy                              # deploy
npx wrangler secret put ADMIN_PASSWORD      # change the admin password
npm run tail                                # live logs
npm run typecheck
```

## The demo

The demo is the same code deployed as a separate Worker (`smugless-demo`) with its own bucket (`smugless-demo-photos`) and password, defined as `env.demo` in `wrangler.jsonc`. `scripts/seed.mjs` fills it with six Unsplash galleries (Surfing, Landscapes, Nature, Cities, Macro, Portraits; Surfing is the home page) and an About page for Elena Marsh, a made-up photographer; the page says she's fictional. Re-running the script only adds what's missing.

```bash
npm run deploy:demo
npx wrangler secret put ADMIN_PASSWORD --env demo
npm run deploy:demo-proxy
```

`smugless.kuril.in` is served by a tiny Cloudflare Pages project, `smugless-demo-proxy` (`demo-proxy/`), whose `_worker.js` hands every request to `smugless-demo` through a service binding. kuril.in's DNS isn't on Cloudflare, and a Worker can only take a custom domain on a Cloudflare zone, but Pages accepts a subdomain by CNAME from any DNS host: kuril.in has `CNAME smugless → smugless-demo-proxy.pages.dev`. The project is classic Pages, created with `wrangler pages project create --force`; without `--force`, current wrangler turns it into a Worker, which needs a zone again.

## Limits and costs

- Uploads go through the Worker, so 100 MB per file. Export JPEGs at full resolution; RAW/TIFF/HEIC aren't accepted.
- Free tiers: Workers 100k requests/day, R2 10 GB storage with free egress, Images 5,000 unique transformations/month. 100 photos use at most ~1,500 transformations, once.

## Not done yet

- **Backups**: R2 is the only copy of the originals. Create an R2 API token and `rclone sync` the bucket somewhere else on a schedule.
- **Redirects from an old site**: map your previous portfolio's URLs to the new galleries when migrating.

## License

MIT. Bundled libraries: [PhotoSwipe](https://photoswipe.com) and [SortableJS](https://github.com/SortableJS/Sortable), both MIT (see `public/vendor/`).
