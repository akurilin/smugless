import { describe, expect, it } from "vitest";
import app from "../src/index";
import { basic, ctx, makeEnv, ORIGIN, PASSWORD } from "./helpers";

const req = (path: string, init: RequestInit, env = makeEnv()) => app.request(ORIGIN + path, init, env, ctx);

async function signIn(env = makeEnv(), password = PASSWORD) {
  return req("/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
    body: new URLSearchParams({ password }),
  }, env);
}

function sessionCookie(res: Response): string {
  return (res.headers.get("Set-Cookie") ?? "").split(";")[0];
}

describe("security headers", () => {
  it("sends CSP and anti-framing headers on HTML pages", async () => {
    const res = await req("/", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
  });

  it("sends nosniff but not CSP on non-HTML responses", async () => {
    const res = await req("/favicon.svg", {});
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });
});

describe("password sign-in", () => {
  it("signs in with the right password and the cookie opens the API", async () => {
    const env = makeEnv();
    const res = await signIn(env);
    expect(res.status).toBe(303);
    const cookie = sessionCookie(res);
    expect(res.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    const api = await req("/api/manifest", { headers: { Cookie: cookie } }, env);
    expect(api.status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    expect((await signIn(makeEnv(), "wrong")).status).toBe(401);
  });

  it("rejects a forged session cookie", async () => {
    const forged = `smugless_session=${Math.floor(Date.now() / 1000) + 3600}.AAAA`;
    expect((await req("/api/manifest", { headers: { Cookie: forged } })).status).toBe(401);
  });
});

describe("HTTP Basic auth", () => {
  it("works by default", async () => {
    expect((await req("/api/manifest", { headers: basic() })).status).toBe(200);
  });
});
