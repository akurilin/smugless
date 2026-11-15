import type { Env, Photo } from "./manifest";

// Fixed size ladder. Restricting widths keeps the number of distinct
// transformations (what Cloudflare Images bills) small and bounded.
export const WIDTHS = [400, 800, 1200, 1600, 2400] as const;
export type Format = "avif" | "webp" | "jpg";

const MIME: Record<Format, ImageOutputOptions["format"]> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
};
const QUALITY: Record<Format, number> = { avif: 65, webp: 82, jpg: 85 };

export function imageUrl(id: string, width: number, fmt: Format): string {
  return `/img/${id}/${width}.${fmt}`;
}

/**
 * srcset for a photo, never advertising more pixels than the original has.
 * Sizes at or below the original width are listed as-is; the next bucket up
 * (which Images scales down to the original width) is listed at its true width.
 */
export function srcset(p: Photo, fmt: Format): string {
  const entries: string[] = [];
  for (const w of WIDTHS) {
    if (w <= p.w) entries.push(`${imageUrl(p.id, w, fmt)} ${w}w`);
    else {
      entries.push(`${imageUrl(p.id, w, fmt)} ${p.w}w`);
      break;
    }
  }
  return entries.join(", ");
}

/** Pixel size actually returned for a requested bucket width. */
export function displaySize(p: Photo, width: number): { w: number; h: number } {
  const w = Math.min(p.w, width);
  return { w, h: Math.round((p.h * w) / p.w) };
}

/**
 * GET /img/<id>/<width>.<fmt>
 * Serves a resized copy from R2 if we've made it before; otherwise resizes the
 * original with Cloudflare Images, stores the result under derived/, and serves it.
 * Originals themselves are never served.
 */
export async function serveImage(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  id: string,
  width: number,
  fmt: Format,
): Promise<Response> {
  const headers = {
    "Content-Type": MIME[fmt],
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const key = `derived/${id}/${width}.${fmt}`;

  const cached = await env.BUCKET.get(key);
  if (cached) return new Response(cached.body, { headers });

  const original = await env.BUCKET.get(`originals/${id}`);
  if (!original) return new Response("Not found", { status: 404 });

  try {
    const result = await env.IMAGES.input(original.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: MIME[fmt], quality: QUALITY[fmt] });
    const bytes = await result.response().arrayBuffer();
    ctx.waitUntil(env.BUCKET.put(key, bytes, { httpMetadata: { contentType: MIME[fmt] } }));
    return new Response(bytes, { headers });
  } catch (err) {
    console.error("transform failed", id, width, fmt, err);
    return new Response("Could not process image", { status: 502 });
  }
}
