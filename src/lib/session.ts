/**
 * Session token: which space (account) the current browser is unlocked into.
 *
 * Deliberately dependency-free and Web-Crypto-only so the SAME code runs in
 * Edge middleware and in Node server components. Do NOT import next/headers
 * here — middleware can't use it. See src/lib/space.ts for the cookie reader.
 */

export const SPACES = ["decoy", "private"] as const;
export type SpaceId = (typeof SPACES)[number];

export function isSpaceId(v: unknown): v is SpaceId {
  return typeof v === "string" && (SPACES as readonly string[]).includes(v);
}

/** Innocuous cookie name — nothing about it hints that a second vault exists. */
export const SPACE_COOKIE = "los.sid";
export const SESSION_DAYS = 30;

interface Payload {
  s: string; // opaque space code — see spaceCode()
  e: number; // expiry, epoch ms
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  // Fail closed: without a secret we cannot tell a real token from a forged one.
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short (need ≥32 chars)");
  return s;
}

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

/** Constant-time string compare — a fast `!==` would leak the signature byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The cookie stores an opaque code, not the literal space name. Base64 is not
 * encryption — anyone poking at the cookie jar can decode the payload — and a
 * token that reads {"s":"private"} would announce that a second vault exists.
 * The code is a keyed digest, so it means nothing without AUTH_SECRET.
 */
async function spaceCode(space: SpaceId): Promise<string> {
  return (await hmac(`space:${space}`)).slice(0, 16);
}

export async function signSession(space: SpaceId, days = SESSION_DAYS): Promise<string> {
  const payload: Payload = { s: await spaceCode(space), e: Date.now() + days * 86_400_000 };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

/** Returns the space this token unlocks, or null if absent/forged/expired. */
export async function verifySession(token: string | undefined | null): Promise<SpaceId | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    if (!safeEqual(sig, await hmac(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Payload;
    if (typeof payload.s !== "string") return null;
    if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
    for (const space of SPACES) {
      if (safeEqual(payload.s, await spaceCode(space))) return space;
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeDays = SESSION_DAYS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeDays * 86_400,
  };
}
