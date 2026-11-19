# smugless

A small self-hosted photo portfolio: one Cloudflare Worker, one private R2 bucket, Cloudflare Images for resizing.

- **Public site**: `/` lists galleries (or shows one chosen gallery, set under Site → Home page in the admin), `/<slug>` shows a gallery as a justified grid with a PhotoSwipe lightbox (swipe, pinch-zoom) and no heading, just the photos (the description is used for search and link previews), and an optional `/about` page shows a portrait, a bio and a contact email.
- **Admin**: `/admin` (sign in at `/login`). Create, rename and reorder galleries; drag and drop photos to upload; drag to reorder; captions; cover photo; move between galleries; delete (click twice). Edit the About page (text, email, portrait) under Pages. Changes autosave.

Live: https://smugless.alex-d5b.workers.dev

Demo (Unsplash photos): https://smugless.kuril.in

## How it works

```
R2 bucket smugless-photos (private)
  manifest.json            galleries, order, titles, captions, About page: the whole site
  originals/<id>           uploaded files, never served directly
  derived/<id>/<w>.<fmt>   resized copies, made on first request
  trash/<id>               originals of deleted photos
```

- `GET /img/<id>/<width>.<avif|webp|jpg>` serves `derived/` if present; otherwise resizes the original with the Images binding, saves it to `derived/`, and serves it. Widths are fixed at 400/800/1200/1600/2400, so each photo produces at most 15 transformations. The output carries no EXIF, GPS included.
- Pages render on each request from `manifest.json`, so changes are live immediately. No build step.
- The admin page holds the manifest in memory and PUTs the whole thing back. The server validates it (unique, non-reserved URLs).

Code: `src/index.ts` (routes), `src/images.ts`, `src/manifest.ts`, `src/views.ts`, `src/auth.ts`; browser code in `public/static/`.

## Commands

```bash
npm run deploy                              # deploy to production
npx wrangler secret put ADMIN_PASSWORD      # change the admin password
npm run tail                                # live logs
SMUGLESS_URL=https://smugless.alex-d5b.workers.dev SMUGLESS_PASSWORD="$(cat .admin-password)" node scripts/seed.mjs
```

The generated admin password is in `.admin-password` (git-ignored). Signing in sets a 30-day session cookie signed with that password, so changing the secret signs everyone out. Scripts can skip the login page by sending the password via HTTP Basic auth (any username), as `scripts/seed.mjs` does.

## Demo

The demo is the same code deployed as a separate Worker (`smugless-demo`) with its own bucket (`smugless-demo-photos`) and password (`.demo-admin-password`, git-ignored), defined as `env.demo` in `wrangler.jsonc`. It never touches production data.

`scripts/seed.mjs` fills it with six Unsplash galleries (Surfing, Landscapes, Nature, Cities, Macro, Portraits; Surfing is the home page) and an About page for Elena Marsh, a made-up photographer; the page says she's fictional. Re-running it only adds what's missing.

```bash
npm run deploy:demo                                       # deploy the demo
npx wrangler secret put ADMIN_PASSWORD --env demo         # change the demo password
SMUGLESS_URL=https://smugless-demo.alex-d5b.workers.dev SMUGLESS_PASSWORD="$(cat .demo-admin-password)" node scripts/seed.mjs
npm run deploy:demo-proxy                                 # redeploy the smugless.kuril.in proxy (rarely needed)
```

`smugless.kuril.in` is served by a tiny Cloudflare Pages project, `smugless-demo-proxy` (`demo-proxy/`), whose `_worker.js` hands every request to `smugless-demo` through a service binding. kuril.in's DNS isn't on Cloudflare, and a Worker can only take a custom domain on a Cloudflare zone, but Pages accepts a subdomain by CNAME from any DNS host: kuril.in has `CNAME smugless → smugless-demo-proxy.pages.dev`. The project is classic Pages, created with `wrangler pages project create --force`; without `--force`, current wrangler turns it into a Worker, which needs a zone again.

## Limits and costs

- Uploads go through the Worker, so 100 MB per file. Export JPEGs at full resolution; RAW/TIFF/HEIC aren't accepted.
- Free tiers: Workers 100k requests/day, R2 10 GB storage with free egress, Images 5,000 unique transformations/month. 100 photos use at most ~1,500 transformations, once.

## Not done yet

- **Custom domain**: put the domain's DNS on Cloudflare, then add a `routes` entry with `custom_domain: true` in `wrangler.jsonc`. With a custom domain, Cloudflare's edge cache also serves images and pages without invoking the Worker.
- **Backups**: R2 is the only copy of the originals. Create an R2 API token and `rclone sync` the bucket somewhere else on a schedule.
- **Redirects from an old site**: add redirects when migrating.
