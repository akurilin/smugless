import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "./manifest";

// Admin access: a login form sets a signed session cookie. Scripts can instead
// send the password via HTTP Basic auth (any username). Changing the
// ADMIN_PASSWORD secret invalidates all sessions, since it is the signing key.

const COOKIE = "smugless_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

type C = Context<{ Bindings: Env }>;

export const requireAdmin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const password = c.env.ADMIN_PASSWORD;
  if (!password) return c.text("Admin is disabled until the ADMIN_PASSWORD secret is set.", 503);

  if ((await validSession(password, getCookie(c, COOKIE))) || (await validBasic(password, c))) return next();

  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not signed in" }, 401);
  return c.redirect("/login");
};

export async function checkPassword(c: C, given: string): Promise<boolean> {
  const password = c.env.ADMIN_PASSWORD;
  return !!password && (await equal(given, password));
}

export async function startSession(c: C): Promise<void> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const sig = await sign(c.env.ADMIN_PASSWORD!, exp);
  setCookie(c, COOKIE, `${exp}.${sig}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function endSession(c: C): void {
  deleteCookie(c, COOKIE, { path: "/", secure: true });
}

async function validSession(password: string, value?: string): Promise<boolean> {
  const [exp, sig] = (value ?? "").split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return equal(sig, await sign(password, exp));
}

async function validBasic(password: string, c: C): Promise<boolean> {
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const bin = atob(header.slice(6));
    const decoded = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    return equal(decoded.slice(decoded.indexOf(":") + 1), password);
  } catch {
    return false;
  }
}

async function sign(password: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`smugless-session:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function equal(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}
