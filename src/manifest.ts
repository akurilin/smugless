// The whole site lives in one JSON file in R2. The admin page edits it and
// saves it back whole; the public pages render from it.

export interface Photo {
  id: string;
  w: number; // pixel dimensions of the original, as displayed (orientation applied)
  h: number;
  filename: string; // original upload name, for your reference only
  caption?: string;
}

export interface Gallery {
  slug: string; // becomes the route: /<slug>
  title: string;
  description?: string;
  cover?: string; // photo id; defaults to the first photo
  photos: Photo[]; // display order
}

export interface Manifest {
  site: { title: string; tagline?: string };
  galleries: Gallery[]; // navigation order
}

export interface Env {
  BUCKET: R2Bucket;
  IMAGES: ImagesBinding;
  ADMIN_PASSWORD?: string;
}

const KEY = "manifest.json";

export const PHOTO_ID = /^[a-f0-9]{16}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
// Paths the Worker or static assets already use.
const RESERVED = new Set(["admin", "api", "img", "login", "logout", "static", "vendor", "favicon.ico", "robots.txt"]);

export async function loadManifest(bucket: R2Bucket): Promise<Manifest> {
  const obj = await bucket.get(KEY);
  if (!obj) return { site: { title: "Portfolio" }, galleries: [] };
  return obj.json<Manifest>();
}

export async function saveManifest(bucket: R2Bucket, m: Manifest): Promise<void> {
  await bucket.put(KEY, JSON.stringify(m, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export function findPhoto(m: Manifest, id: string): Photo | undefined {
  for (const g of m.galleries) {
    const p = g.photos.find((p) => p.id === id);
    if (p) return p;
  }
}

/** Returns a cleaned copy of the manifest, or an error message. */
export function validateManifest(input: unknown): Manifest | string {
  const obj = input as Record<string, any>;
  if (!obj || typeof obj !== "object") return "Manifest must be an object";
  const site = obj.site ?? {};
  if (typeof site.title !== "string" || !site.title.trim()) return "Site title is required";
  if (!Array.isArray(obj.galleries)) return "galleries must be an array";

  const slugs = new Set<string>();
  const ids = new Set<string>();
  const galleries: Gallery[] = [];

  for (const g of obj.galleries) {
    if (typeof g?.title !== "string" || !g.title.trim()) return "Every gallery needs a title";
    if (typeof g.slug !== "string" || !SLUG.test(g.slug))
      return `URL "${g.slug}" for "${g.title}" must be lowercase letters, numbers and dashes`;
    if (RESERVED.has(g.slug)) return `URL "${g.slug}" is reserved; pick another`;
    if (slugs.has(g.slug)) return `Two galleries use the URL "${g.slug}"`;
    slugs.add(g.slug);
    if (!Array.isArray(g.photos)) return `Gallery "${g.title}" has no photo list`;

    const photos: Photo[] = [];
    for (const p of g.photos) {
      if (typeof p?.id !== "string" || !PHOTO_ID.test(p.id)) return "Invalid photo id";
      if (ids.has(p.id)) return `Photo ${p.filename ?? p.id} appears twice`;
      ids.add(p.id);
      if (!Number.isInteger(p.w) || !Number.isInteger(p.h) || p.w <= 0 || p.h <= 0)
        return `Photo ${p.filename ?? p.id} has invalid dimensions`;
      photos.push({
        id: p.id,
        w: p.w,
        h: p.h,
        filename: String(p.filename ?? ""),
        ...(typeof p.caption === "string" && p.caption.trim() ? { caption: p.caption } : {}),
      });
    }

    galleries.push({
      slug: g.slug,
      title: g.title.trim(),
      ...(typeof g.description === "string" && g.description.trim() ? { description: g.description } : {}),
      ...(typeof g.cover === "string" && photos.some((p) => p.id === g.cover) ? { cover: g.cover } : {}),
      photos,
    });
  }

  return {
    site: {
      title: site.title.trim(),
      ...(typeof site.tagline === "string" && site.tagline.trim() ? { tagline: site.tagline } : {}),
    },
    galleries,
  };
}
