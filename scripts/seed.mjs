#!/usr/bin/env node
// Seeds the site with free Unsplash photos (Unsplash license), uploading them
// through the same admin API the upload page uses. Skips galleries whose URL
// already exists, so it's safe to re-run.
//
//   SMUGLESS_URL=https://smugless.<you>.workers.dev SMUGLESS_PASSWORD=... node scripts/seed.mjs

const BASE = process.env.SMUGLESS_URL?.replace(/\/$/, "");
const PASSWORD = process.env.SMUGLESS_PASSWORD;
if (!BASE || !PASSWORD) {
  console.error("Set SMUGLESS_URL and SMUGLESS_PASSWORD");
  process.exit(1);
}
const auth = { Authorization: "Basic " + Buffer.from(`seed:${PASSWORD}`).toString("base64") };

// Unsplash photo ids (images.unsplash.com/photo-<id>)
const GALLERIES = [
  {
    slug: "landscapes",
    title: "Landscapes",
    description: "Mountains, lakes and long roads.",
    photos: [
      "1506744038136-46273834b3fb", "1501785888041-af3ef285b470", "1470071459604-3b5ec3a7fe05",
      "1500530855697-b586d89ba3ee", "1493246507139-91e8fad9978e", "1519681393784-d120267933ba",
      "1464822759023-fed622ff2c3b", "1472214103451-9374bd1c798e", "1507525428034-b723cf961d3e",
    ],
  },
  {
    slug: "nature",
    title: "Nature",
    description: "Forests, water and small things.",
    photos: [
      "1469474968028-56623f02e42e", "1441974231531-c6227db76b6e", "1447752875215-b2761acb3c5d",
      "1426604966848-d7adac402bff", "1433086966358-54859d0ed716", "1418065460487-3e41a6c84dc5",
      "1490750967868-88aa4486c946", "1501004318641-b39e6451bec6", "1475924156734-496f6cac6ec1",
      "1505765050516-f72dcac9c60e", "1482192596544-9eb780fc7f66",
    ],
  },
  {
    slug: "cities",
    title: "Cities",
    description: "Streets and skylines.",
    photos: [
      "1477959858617-67f85cf4f1df", "1480714378408-67cf0d13bc1b", "1449824913935-59a10b8d2000",
      "1514565131-fce0801e5785", "1502602898657-3e91760cbb34", "1499856871958-5b9627545d1a",
      "1513635269975-59663e0ac1ad", "1516483638261-f4dbaf036963",
    ],
  },
  {
    slug: "macro",
    title: "Macro",
    description: "Beetles, bees and the very small.",
    photos: [
      "1630971027932-85249b204a37", "1688076672050-8b9be2f56c0a", "1791297969061-dde5d7ed6fc4",
      "1771090354970-bcc9c4fa3725", "1757540980175-5e7206eb52fa", "1620837292558-bef9592b4dae",
      "1765986575585-1f61d27e51cb", "1790360484612-da016da03a03", "1786656793456-a2a81feadc9c",
    ],
  },
  {
    slug: "portraits",
    title: "Portraits",
    description: "People I met along the way, mostly in natural light.",
    photos: [
      "1544005313-94ddf0286df2", "1616235931343-10a92ecaeaf2", "1506863530036-1efeddceb993",
      "1558507652-2d9626c4e67a", "1674492396060-7ca95cf3e57a", "1586425225143-0c8f59053610",
      "1635713150362-ed0cd425e697", "1629794138560-46d2815a6d79", "1623739770355-0677ee41f560",
      "1498551172505-8ee7ad69f235",
    ],
  },
  {
    slug: "surfing",
    title: "Surfing",
    description: "Early mornings in the water.",
    photos: [
      "1530870110042-98b2cb110834", "1787894653068-bf1eeb927af4", "1526342122811-2a9c8512023d",
      "1559627755-42212e5c5fdf", "1535182463927-440364075d9c", "1771197265637-3ed8f0039e20",
      "1609870025624-98b62826e80a", "1527731149372-fae504a1185f", "1513569143478-b38b2c0ef97f",
      "1517699418036-fb5d179fef0c", "1493225255756-d9584f8606e9",
    ],
  },
];

// A made-up photographer for the demo's About page. The portrait hides the face
// behind a camera, so no real, recognizable person stands in for a fictional one.
const SITE = { title: "Elena Marsh", tagline: "Landscapes, oceans and small things, from the Northern California coast." };
const ABOUT = {
  title: "About",
  portrait: "1549981832-2ba2ee913334",
  email: "hello@elenamarsh.example",
  text: [
    "I photograph the places where the land runs out: coastlines, ridgelines, the edges of cities at first light. Most of my work starts with a long drive and an early alarm, and ends with whatever the weather decides to give me.",
    "I grew up in Santa Cruz with a surfboard long before a camera, and the ocean is still where I spend most mornings. Over the last decade I've shot for travel and outdoor brands, followed surf contests up and down the Pacific coast, and made portraits of the people I meet along the way. The macro work started as a rainy-day project and never stopped.",
    "I'm available for editorial and commercial commissions, and prints of everything here are available on request.",
    "This is a demo of Smugless: Elena is fictional, and every photo on this site comes from Unsplash.",
  ].join("\n\n"),
};

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...auth, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Width/height from a JPEG's SOF marker. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + len;
  }
  throw new Error("Not a JPEG");
}

async function upload(unsplashId) {
  const img = await fetch(`https://images.unsplash.com/photo-${unsplashId}?w=3000&q=90&fm=jpg`);
  if (!img.ok) throw new Error(`download ${unsplashId}: ${img.status}`);
  const bytes = new Uint8Array(await img.arrayBuffer());
  const { w, h } = jpegSize(bytes);
  const filename = `unsplash-${unsplashId}.jpg`;
  const { id } = await api("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "X-Filename": encodeURIComponent(filename) },
    body: bytes,
  });
  console.log(`  ${filename} ${w}×${h} (${(bytes.length / 1e6).toFixed(1)} MB) → ${id}`);
  return { id, w, h, filename };
}

const manifest = await api("/api/manifest");
const save = () =>
  api("/api/manifest", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });

// Only replace the defaults (or this script's earlier "Smugless" title), never a title you set.
if (["Portfolio", "Smugless"].includes(manifest.site.title)) {
  manifest.site.title = SITE.title;
  manifest.site.tagline = SITE.tagline;
}

for (const def of GALLERIES) {
  if (manifest.galleries.some((g) => g.slug === def.slug)) {
    console.log(`Skipping ${def.slug}: already exists`);
    continue;
  }
  console.log(`Gallery ${def.title}`);
  const photos = [];
  for (let i = 0; i < def.photos.length; i += 3) {
    photos.push(...(await Promise.all(def.photos.slice(i, i + 3).map(upload))));
  }
  photos[0].caption = "Photo via Unsplash";
  manifest.galleries.push({ slug: def.slug, title: def.title, description: def.description, photos });
  // Save after each gallery so a failure part-way keeps what's done.
  await save();
}

if (manifest.about) {
  console.log("Skipping About page: already exists");
} else {
  console.log("About page");
  const { portrait, ...about } = ABOUT;
  const photo = await upload(portrait);
  photo.caption = `${SITE.title}, behind the camera`;
  manifest.about = { ...about, photo };
}
await save();

console.log(`Done. Open ${BASE}/`);
