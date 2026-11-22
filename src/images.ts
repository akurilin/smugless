import { PHOTO_ID, type Env, type Photo } from "./manifest";

// Fixed size ladder. Restricting widths keeps the number of distinct
// transformations (what Cloudflare Images bills) small and bounded.
export const WIDTHS = [400, 800, 1200, 1600, 2400] as const;
export type Format = "avif" | "webp" | "jpg";
export const IMAGE_VARIANT_PARAM = "size";
export const LIMITED_IMAGE_VARIANT = "limited-v1";
const PUBLIC_MAX_EDGE = 1600;
const PUBLIC_SCALE = 0.75;

const MIME: Record<Format, ImageOutputOptions["format"]> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
};
const QUALITY: Record<Format, number> = { avif: 65, webp: 82, jpg: 85 };

export function parseImageRequest(id: string, file: string) {
  const match = /^(\d+)\.(avif|webp|jpg)$/.exec(file);
  if (!PHOTO_ID.test(id) || !match) return;
  const width = Number(match[1]);
  if (!(WIDTHS as readonly number[]).includes(width)) return;
  return { id, width, format: match[2] as Format };
}

export function publicImageEdge(p: Photo, limited: boolean): number | undefined {
  if (!limited) return;
  return Math.max(1, Math.min(PUBLIC_MAX_EDGE, Math.floor(Math.max(p.w, p.h) * PUBLIC_SCALE)));
}

export function imageUrl(id: string, width: number, fmt: Format, edgeLimit?: number): string {
  const variant = edgeLimit === undefined ? "display-v1" : LIMITED_IMAGE_VARIANT;
  return `/img/${id}/${width}.${fmt}?${IMAGE_VARIANT_PARAM}=${variant}`;
}

// Keep the request widths and advertise the actual width of each available copy.
export function srcset(p: Photo, fmt: Format, edgeLimit?: number): string {
  const entries: string[] = [];
  let previousWidth = 0;
  for (const width of WIDTHS) {
    const size = displaySize(p, width, edgeLimit);
    if (size.w === previousWidth) break;
    entries.push(`${imageUrl(p.id, width, fmt, edgeLimit)} ${size.w}w`);
    previousWidth = size.w;
  }
  return entries.join(", ");
}

/** Pixel size actually returned for a requested bucket width. */
export function displaySize(p: Photo, width: number, edgeLimit = Infinity): { w: number; h: number } {
  const scale = Math.min(1, width / p.w, edgeLimit / Math.max(p.w, p.h));
  return { w: Math.max(1, Math.round(p.w * scale)), h: Math.max(1, Math.round(p.h * scale)) };
}

// Use width alone when it can enforce the limit and reuse the same cached copy.
export function resizeBounds(p: Photo, width: number, edgeLimit?: number): { width: number; height?: number } {
  if (edgeLimit === undefined || width * Math.max(p.w, p.h) <= edgeLimit * p.w) return { width };
  return p.w >= p.h ? { width: edgeLimit } : { width: edgeLimit, height: edgeLimit };
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
  bounds: { width: number; height?: number },
  fmt: Format,
  cacheControl: string,
): Promise<Response> {
  const headers = {
    "Content-Type": MIME[fmt],
    "Cache-Control": cacheControl,
  };
  const { width, height } = bounds;
  const key = `derived/${id}/${height === undefined ? width : `${width}x${height}`}.${fmt}`;

  const cached = await env.BUCKET.get(key);
  if (cached) return new Response(cached.body, { headers });

  const original = await env.BUCKET.get(`originals/${id}`);
  if (!original) return new Response("Not found", { status: 404 });

  try {
    const result = await env.IMAGES.input(original.body)
      .transform({ ...bounds, fit: "scale-down" })
      .output({ format: MIME[fmt], quality: QUALITY[fmt] });
    const bytes = await result.response().arrayBuffer();
    ctx.waitUntil(env.BUCKET.put(key, bytes, { httpMetadata: { contentType: MIME[fmt] } }));
    return new Response(bytes, { headers });
  } catch (err) {
    console.error("transform failed", id, width, fmt, err);
    return new Response("Could not process image", { status: 502 });
  }
}
