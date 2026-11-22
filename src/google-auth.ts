import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { base64url, createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./manifest";

export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ID_TOKEN_ALGORITHM = "RS256";
const LOGIN_COOKIE = "__Host-smugless_google_login";
const LOGIN_MAX_AGE = 10 * 60;
const RANDOM_BYTES = 32;
const PKCE_METHOD = "S256";
const AUTHORIZATION_CODE = "authorization_code";
const SEE_OTHER = 303;

type C = Context<{ Bindings: Env }>;
type GoogleConfig = { clientId: string; secret: string; email: string; sessionKey: string };

export function googleConfig(env: Env): GoogleConfig | undefined {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const secret = env.GOOGLE_CLIENT_SECRET;
  const email = env.GOOGLE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!clientId || !secret || !email) return;
  return { clientId, secret, email, sessionKey: JSON.stringify(["google", clientId, email, secret]) };
}

export async function startGoogleLogin(c: C, config: GoogleConfig): Promise<Response> {
  const state = base64url.encode(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)));
  const nonce = base64url.encode(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)));
  const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)));
  const challenge = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

  // Tie the callback to this browser. Google receives the challenge, and only this cookie holds the verifier.
  setCookie(c, LOGIN_COOKIE, `${state}.${nonce}.${verifier}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: LOGIN_MAX_AGE,
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: new URL(GOOGLE_CALLBACK_PATH, c.req.url).href,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    code_challenge: base64url.encode(new Uint8Array(challenge)),
    code_challenge_method: PKCE_METHOD,
  }).toString();
  return c.redirect(url.href, SEE_OTHER);
}

export async function finishGoogleLogin(c: C, config: GoogleConfig): Promise<boolean> {
  const [state, nonce, verifier] = getCookie(c, LOGIN_COOKIE)?.split(".") ?? [];
  deleteCookie(c, LOGIN_COOKIE, { path: "/", secure: true });
  const code = c.req.query("code");
  if (!code || !state || !nonce || !verifier || c.req.query("state") !== state) return false;

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.secret,
        code,
        code_verifier: verifier,
        grant_type: AUTHORIZATION_CODE,
        redirect_uri: new URL(GOOGLE_CALLBACK_PATH, c.req.url).href,
      }),
    });
    if (!response.ok) return false;
    const { id_token: token } = await response.json<{ id_token?: string }>();
    if (!token) return false;
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: config.clientId,
      algorithms: [ID_TOKEN_ALGORITHM],
      requiredClaims: ["exp", "sub", "nonce", "email"],
    });

    // Google can confirm current ownership of Gmail and managed Workspace addresses.
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    const googleManagesEmail = email.endsWith("@gmail.com") || (typeof payload.hd === "string" && !!payload.hd);
    return payload.nonce === nonce && payload.email_verified === true && email === config.email && googleManagesEmail;
  } catch {
    return false;
  }
}
