import type { Env, Manifest } from "./manifest";

// Site icon (favicon). Without an upload, every site gets a generated SVG with
// the first letter of its title, so it never shows a blank tab or 404s.
// An icon uploaded in the admin replaces it, served as a 180×180 PNG (also
// used as the iPhone home-screen icon).

const ICON_SIZE = 180;
const LONG_CACHE = "public, max-age=31536000, immutable"; // URLs carry a version
const SHORT_CACHE = "public, max-age=3600"; // /favicon.ico has no version

export function initial(title: string): string {
  const ch = [...title.trim()].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "?";
  return ch.toLocaleUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function defaultIconSvg(title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<style>rect{fill:#1b1b1a}text{fill:#f6f5f2}@media (prefers-color-scheme:dark){rect{fill:#ecebe7}text{fill:#111110}}</style>
<rect width="64" height="64" rx="14"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif" font-size="38" font-weight="600">${escapeXml(initial(title))}</text>
</svg>`;
}

/** <link> tags for the page head; versioned so a new icon or title shows up at once. */
export function iconLinks(m: Manifest): { href: string; type: string; touch: boolean } {
  if (m.site.icon) return { href: `/icon.png?v=${m.site.icon.id}`, type: "image/png", touch: true };
  return { href: `/favicon.svg?v=${encodeURIComponent(initial(m.site.title))}`, type: "image/svg+xml", touch: false };
}

export function defaultIconResponse(m: Manifest, versioned: boolean): Response {
  return new Response(defaultIconSvg(m.site.title), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": versioned ? LONG_CACHE : SHORT_CACHE },
  });
}

/** The uploaded icon as a square PNG, made once with Cloudflare Images and kept in R2. */
export async function uploadedIconResponse(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  id: string,
  versioned: boolean,
): Promise<Response> {
  const headers = { "Content-Type": "image/png", "Cache-Control": versioned ? LONG_CACHE : SHORT_CACHE };
  const key = `derived/${id}/icon-${ICON_SIZE}.png`;

  const cached = await env.BUCKET.get(key);
  if (cached) return new Response(cached.body, { headers });

  const original = await env.BUCKET.get(`originals/${id}`);
  if (!original) return new Response("Not found", { status: 404 });

  try {
    const result = await env.IMAGES.input(original.body)
      .transform({ width: ICON_SIZE, height: ICON_SIZE, fit: "cover" })
      .output({ format: "image/png" });
    const bytes = await result.response().arrayBuffer();
    ctx.waitUntil(env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "image/png" } }));
    return new Response(bytes, { headers });
  } catch (err) {
    console.error("icon transform failed", id, err);
    return new Response("Could not process icon", { status: 502 });
  }
}
