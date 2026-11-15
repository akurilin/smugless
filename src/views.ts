import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Gallery, Manifest, Photo } from "./manifest";
import { displaySize, imageUrl, srcset } from "./images";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

function coverOf(g: Gallery): Photo | undefined {
  return g.photos.find((p) => p.id === g.cover) ?? g.photos[0];
}

function paragraphs(text?: string): Html | string {
  if (!text) return "";
  return html`${text.split(/\n\s*\n/).map((para) => html`<p>${para}</p>`)}`;
}

function layout(
  m: Manifest,
  opts: { title: string; description?: string; ogImage?: string; current?: string; body: Html },
): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
${opts.description ? html`<meta name="description" content="${opts.description}">` : ""}
<meta property="og:title" content="${opts.title}">
${opts.ogImage ? html`<meta property="og:image" content="${opts.ogImage}">` : ""}
<link rel="stylesheet" href="/static/site.css">
</head>
<body>
<header class="site-header">
  <a class="site-title" href="/">${m.site.title}</a>
  <nav class="site-nav">
    ${m.galleries.map(
      (g) =>
        html`<a href="/${g.slug}"${opts.current === g.slug ? html` aria-current="page"` : ""}>${g.title}</a>`,
    )}
  </nav>
</header>
<main>${opts.body}</main>
<footer class="site-footer">© ${new Date().getUTCFullYear()} ${m.site.title}</footer>
</body>
</html>`;
}

export function homePage(m: Manifest, origin: string): Html {
  const first = m.galleries.map(coverOf).find(Boolean);
  const cards = m.galleries.map((g) => {
    const cover = coverOf(g);
    return html`<a class="card" href="/${g.slug}">
      <div class="card-image">
        ${cover
          ? html`<picture>
              <source type="image/avif" srcset="${srcset(cover, "avif")}" sizes="(max-width: 640px) 100vw, 33vw">
              <img src="${imageUrl(cover.id, 800, "webp")}" srcset="${srcset(cover, "webp")}"
                   sizes="(max-width: 640px) 100vw, 33vw" alt="" decoding="async">
            </picture>`
          : ""}
      </div>
      <span class="card-title">${g.title}</span>
      <span class="card-count">${g.photos.length} ${g.photos.length === 1 ? "photo" : "photos"}</span>
    </a>`;
  });

  return layout(m, {
    title: m.site.title,
    description: m.site.tagline,
    ogImage: first ? origin + imageUrl(first.id, 1200, "jpg") : undefined,
    body: html`
      ${m.site.tagline ? html`<p class="tagline">${m.site.tagline}</p>` : ""}
      ${m.galleries.length
        ? html`<div class="cards">${cards}</div>`
        : html`<p class="empty">Nothing here yet.</p>`}
    `,
  });
}

export function galleryPage(m: Manifest, g: Gallery, origin: string): Html {
  const cover = coverOf(g);
  const tiles = g.photos.map((p, i) => {
    const ratio = +(p.w / p.h).toFixed(4);
    const full = displaySize(p, 2400);
    // Rough rendered width in a justified row (row height ~300px desktop, ~180px phone).
    const sizes = `(max-width: 640px) ${Math.min(100, Math.round(ratio * 50))}vw, ${Math.round(ratio * 340)}px`;
    const eager = i < 4;
    return html`<a class="tile" style="--r:${ratio}" href="${imageUrl(p.id, 2400, "webp")}"
        data-pswp-width="${full.w}" data-pswp-height="${full.h}"
        data-pswp-srcset="${srcset(p, "webp")}"
        ${p.caption ? html`data-caption="${p.caption}"` : ""}>
      <picture>
        <source type="image/avif" srcset="${srcset(p, "avif")}" sizes="${sizes}">
        <img src="${imageUrl(p.id, 800, "webp")}" srcset="${srcset(p, "webp")}" sizes="${sizes}"
             width="${p.w}" height="${p.h}" alt="${p.caption ?? ""}"
             loading="${eager ? "eager" : "lazy"}" decoding="async"${i === 0 ? html` fetchpriority="high"` : ""}>
      </picture>
    </a>`;
  });

  return layout(m, {
    title: `${g.title} · ${m.site.title}`,
    description: g.description?.slice(0, 200),
    ogImage: cover ? origin + imageUrl(cover.id, 1200, "jpg") : undefined,
    current: g.slug,
    body: html`
      <section class="gallery-head">
        <h1>${g.title}</h1>
        ${g.description ? html`<div class="description">${paragraphs(g.description)}</div>` : ""}
      </section>
      ${g.photos.length ? html`<div class="grid">${tiles}</div>` : html`<p class="empty">No photos yet.</p>`}
      <script type="module" src="/static/gallery.js"></script>
    `,
  });
}

export function notFoundPage(m: Manifest): Html {
  return layout(m, {
    title: `Not found · ${m.site.title}`,
    body: html`<section class="gallery-head"><h1>Not found</h1><p><a href="/">Back to the portfolio</a></p></section>`,
  });
}

export function loginPage(error?: string): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in · Smugless</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body class="login-body">
<form class="login" method="post" action="/login">
  <h1>Smugless</h1>
  <input type="hidden" name="username" value="admin" autocomplete="username">
  <label>Password
    <input type="password" name="password" autocomplete="current-password" required autofocus>
  </label>
  ${error ? html`<p class="field-error">${error}</p>` : ""}
  <button class="btn primary" type="submit">Sign in</button>
</form>
</body>
</html>`;
}

export function adminPage(): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Smugless admin</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<div id="app"><p class="loading">Loading…</p></div>
<script type="module" src="/static/admin.js"></script>
</body>
</html>`;
}
