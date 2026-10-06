import "server-only";
import { pbkdf2 as pbkdf2Cb, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { supabaseServer } from "./supabase";
import { SPACES, SpaceId, isSpaceId } from "./session";

const pbkdf2 = promisify(pbkdf2Cb);

export const PIN_LENGTH = 4;
const KEY_LEN = 32;
const DEFAULT_ITERATIONS = 210_000;

/**
 * A 4-digit PIN only has 10,000 possibilities, so a stolen database dump would
 * fall in seconds to a plain salted hash. The defence that actually matters here
 * is the server-side pepper: AUTH_SECRET lives in the environment, never in
 * Postgres, so the hashes are useless without also breaching the host.
 */
function pepper(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short (need ≥32 chars)");
  return s;
}

async function derive(pin: string, salt: string, iterations: number): Promise<string> {
  const peppered = createHmac("sha256", pepper()).update(pin).digest();
  const buf = (await pbkdf2(peppered, Buffer.from(salt, "hex"), iterations, KEY_LEN, "sha256")) as Buffer;
  return buf.toString("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

interface SpaceRow {
  id: string;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number;
}

/**
 * Which space (if any) this PIN opens. Every configured space is hashed on every
 * attempt — never short-circuit on the first match, or the response time would
 * quietly reveal which account a PIN belongs to.
 */
export async function spaceForPin(pin: string): Promise<SpaceId | null> {
  if (!isValidPin(pin)) return null;
  const sb = supabaseServer();
  const { data } = await sb.from("spaces").select("id,pin_hash,pin_salt,pin_iterations");
  const rows = ((data as SpaceRow[]) ?? []).filter((r) => r.pin_hash && r.pin_salt && isSpaceId(r.id));

  let matched: SpaceId | null = null;
  for (const row of rows) {
    const hash = await derive(pin, row.pin_salt!, row.pin_iterations || DEFAULT_ITERATIONS);
    if (constantTimeEqualHex(hash, row.pin_hash!) && !matched) matched = row.id as SpaceId;
  }
  return matched;
}

/** Set (or change) a space's PIN. Rejects a PIN already in use by another space. */
export async function setPin(space: SpaceId, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPin(pin)) return { ok: false, error: `PIN must be exactly ${PIN_LENGTH} digits.` };
  const clash = await spaceForPin(pin);
  if (clash && clash !== space) {
    // Two spaces sharing a PIN would make one of them permanently unreachable.
    return { ok: false, error: "That PIN is already in use by the other account." };
  }
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(pin, salt, DEFAULT_ITERATIONS);
  const sb = supabaseServer();
  const { error } = await sb
    .from("spaces")
    .update({ pin_hash: hash, pin_salt: salt, pin_iterations: DEFAULT_ITERATIONS, updated_at: new Date().toISOString() })
    .eq("id", space);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function hasPin(space: SpaceId): Promise<boolean> {
  const sb = supabaseServer();
  const { data } = await sb.from("spaces").select("pin_hash").eq("id", space).maybeSingle();
  return Boolean((data as { pin_hash: string | null } | null)?.pin_hash);
}

/**
 * True when no space has a PIN yet — i.e. a fresh install. Used only to turn the
 * lock screen's generic denial into setup instructions. Once ANY code exists this
 * returns false forever, so a configured deployment reveals nothing about which
 * spaces exist.
 */
export async function noPinsConfigured(): Promise<boolean> {
  const sb = supabaseServer();
  const { count } = await sb.from("spaces").select("*", { count: "exact", head: true }).not("pin_hash", "is", null);
  return (count ?? 0) === 0;
}

export async function pinUpdatedAt(): Promise<Record<string, string>> {
  const sb = supabaseServer();
  const { data } = await sb.from("spaces").select("id,updated_at,pin_hash");
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; updated_at: string; pin_hash: string | null }[]) {
    if (r.pin_hash) out[r.id] = r.updated_at;
  }
  return out;
}

// ------------------------------------------------------------------ throttle

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

/** IPs are stored only as a keyed hash — the throttle table is useless if it leaks. */
function ipKey(ip: string): string {
  return createHmac("sha256", pepper()).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export interface ThrottleState {
  blocked: boolean;
  retryInSec: number;
  remaining: number;
}

export async function checkThrottle(ip: string): Promise<ThrottleState> {
  const sb = supabaseServer();
  const key = ipKey(ip);
  const { data } = await sb.from("auth_throttle").select("attempts,window_start").eq("ip_hash", key).maybeSingle();
  const row = data as { attempts: number; window_start: string } | null;
  if (!row) return { blocked: false, retryInSec: 0, remaining: MAX_ATTEMPTS };

  const age = Date.now() - new Date(row.window_start).getTime();
  if (age > WINDOW_MS) return { blocked: false, retryInSec: 0, remaining: MAX_ATTEMPTS };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { blocked: true, retryInSec: Math.ceil((WINDOW_MS - age) / 1000), remaining: 0 };
  }
  return { blocked: false, retryInSec: 0, remaining: MAX_ATTEMPTS - row.attempts };
}

export async function recordFailure(ip: string): Promise<void> {
  const sb = supabaseServer();
  const key = ipKey(ip);
  const { data } = await sb.from("auth_throttle").select("attempts,window_start").eq("ip_hash", key).maybeSingle();
  const row = data as { attempts: number; window_start: string } | null;
  const fresh = !row || Date.now() - new Date(row.window_start).getTime() > WINDOW_MS;
  await sb.from("auth_throttle").upsert(
    {
      ip_hash: key,
      attempts: fresh ? 1 : row!.attempts + 1,
      window_start: fresh ? new Date().toISOString() : row!.window_start,
    },
    { onConflict: "ip_hash" }
  );
}

export async function clearThrottle(ip: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("auth_throttle").delete().eq("ip_hash", ipKey(ip));
}

export { SPACES };
