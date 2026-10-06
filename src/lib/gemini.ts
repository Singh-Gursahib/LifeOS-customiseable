import "server-only";
import { GoogleGenAI, createPartFromUri, Part, ThinkingLevel } from "@google/genai";

/**
 * Gemini access with cyclic API-key fallback. Keys come from GEMINI_API_KEYS
 * (comma-separated). A module-level round-robin cursor spreads load across
 * keys and, on a quota/rate/permission error, rotates to the next key — with
 * a per-key cooldown so an exhausted key is skipped on subsequent requests
 * instead of being retried first every time. Transient overloads (503) retry
 * on the same key with backoff. Deterministic errors (bad request) fail fast.
 * Model is pinned by GEMINI_MODEL (gemini-3.5-flash).
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

/**
 * Thinking control for gemini-3.5-flash. The model uses `thinkingLevel`
 * (values: "minimal" | "low" | "medium" | "high"; default "medium").
 * NOTE: the older numeric `thinkingBudget` is ignored by 3.x models.
 * Transcription and mechanical tool-calling need no reasoning, so we pin the
 * cheapest level — "minimal" — which cuts latency, token cost, and (by shrinking
 * each request) exposure to the model's intermittent 503 overloads. Ingestion
 * routing keeps a touch more headroom at "low". Override per env if needed.
 */
export const THINK_MINIMAL = { thinkingLevel: ThinkingLevel.MINIMAL };
export const THINK_LOW = { thinkingLevel: ThinkingLevel.LOW };

function apiKeys(): string[] {
  const seen = new Set<string>();
  const keys = (process.env.GEMINI_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && !seen.has(k) && seen.add(k)); // trim + dedupe, preserve order
  if (!keys.length) throw new Error("Missing GEMINI_API_KEYS in .env.local");
  return keys;
}

// Persist rotation state across requests within a warm server instance.
let cursor = 0;
const cooldownUntil = new Map<string, number>(); // key -> epoch ms to skip until

/** How long to bench a key after a given failure, in ms. */
function cooldownFor(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  if (/PerDay|per_day|GenerateRequestsPerDay|free_tier_requests/i.test(msg)) return 30 * 60_000; // daily cap
  if (/403|PERMISSION_DENIED|API key not valid|401|UNAUTHENTICATED/i.test(msg)) return 15 * 60_000; // bad/denied key
  if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) return 60_000; // per-minute rate limit
  return 0;
}

function isRotatableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // quota/rate limits AND key-level failures (denied, invalid, expired) → try the next key
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit|403|PERMISSION_DENIED|API key|401|UNAUTHENTICATED/i.test(msg);
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|UNAVAILABLE|overloaded|high demand|500|INTERNAL/i.test(msg);
}

/** Turn raw Gemini errors into something a human can act on. */
export function humanizeGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/PerDay.*FreeTier|free_tier_requests/i.test(msg)) {
    return "Daily Gemini free-tier quota is used up for this key (resets midnight PT). Add another key to GEMINI_API_KEYS or upgrade the key to a paid tier.";
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) return "Gemini rate limit hit on every configured key — wait a minute and retry.";
  if (/403|PERMISSION_DENIED/i.test(msg)) return "Gemini rejected the API key (permission denied) — check the key in GEMINI_API_KEYS.";
  if (/503|UNAVAILABLE|high demand/i.test(msg)) return "Gemini is overloaded right now — retry in a few minutes.";
  return msg;
}

/**
 * Run fn against the key pool with cyclic fallback.
 * - Starts at the round-robin cursor and walks the full ring once.
 * - Skips keys whose cooldown hasn't elapsed (unless every key is cooling
 *   down, in which case it tries them anyway as a last resort).
 * - Transient overloads (503) retry on the same key with backoff.
 * - Quota/rate/permission errors bench the key (cooldown) and rotate on.
 * - Deterministic errors (e.g. malformed request) throw immediately — rotating
 *   keys can't fix those and would waste the whole pool.
 */
export async function withGemini<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = apiKeys();
  const now = Date.now();
  const ready = keys.filter((k) => (cooldownUntil.get(k) ?? 0) <= now);
  const pool = ready.length ? ready : keys; // all benched? try them anyway
  const start = cursor % pool.length;
  let lastErr: unknown = new Error("No Gemini API keys available");

  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    const ai = new GoogleGenAI({ apiKey: key });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await fn(ai);
        cooldownUntil.delete(key); // healthy again
        cursor = (pool.indexOf(key) + 1) % pool.length; // next call starts on the next key
        return out;
      } catch (err) {
        lastErr = err;
        if (isTransientError(err) && attempt < 2) {
          await new Promise((r) => setTimeout(r, [2500, 8000][attempt]));
          continue;
        }
        if (isRotatableError(err)) {
          const cd = cooldownFor(err);
          if (cd) cooldownUntil.set(key, Date.now() + cd);
          console.warn(`[gemini] key …${key.slice(-6)} failed (${errCode(err)}), benched ${Math.round(cd / 1000)}s, rotating`);
          break; // next key in the ring
        }
        throw err; // deterministic — don't burn the pool
      }
    }
  }
  throw lastErr;
}

function errCode(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.match(/"code":\s*(\d+)/)?.[1] ?? m.match(/\b(4\d\d|5\d\d)\b/)?.[1] ?? "err";
}

const INLINE_LIMIT = 15 * 1024 * 1024; // stay safely under the 20MB request cap

/**
 * Transcribe an audio clip with Gemini.
 * System prompt is exactly "Transcribe this in English." — input may be
 * English, Hindi, or Punjabi; output is English text.
 * Inline base64 for small clips; Files API for anything bigger.
 */
export async function transcribeAudio(bytes: Buffer, mimeType: string): Promise<string> {
  const mime = normalizeAudioMime(mimeType);
  return withGemini(async (ai) => {
    let audioPart: Part;
    if (bytes.byteLength <= INLINE_LIMIT) {
      audioPart = { inlineData: { mimeType: mime, data: bytes.toString("base64") } };
    } else {
      const uploaded = await ai.files.upload({
        file: new Blob([new Uint8Array(bytes)], { type: mime }),
        config: { mimeType: mime },
      });
      // wait for the file to become ACTIVE
      let file = uploaded;
      for (let i = 0; i < 30 && file.state === "PROCESSING"; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        file = await ai.files.get({ name: file.name! });
      }
      if (file.state !== "ACTIVE") throw new Error(`Files API upload not ready (state ${file.state})`);
      audioPart = createPartFromUri(file.uri!, mime);
    }

    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [audioPart] }],
      config: {
        systemInstruction: "Transcribe this in English.",
        temperature: 0,
        thinkingConfig: THINK_MINIMAL, // no reasoning needed for transcription
      },
    });
    const text = (res.text ?? "").trim();
    if (!text) throw new Error("Gemini returned an empty transcript");
    return text;
  });
}

/** Map browser/file mime types to ones Gemini accepts. */
export function normalizeAudioMime(mime: string): string {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  const supported = new Set(["audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac"]);
  if (supported.has(m)) return m;
  const map: Record<string, string> = {
    "audio/mpeg": "audio/mp3",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-aiff": "audio/aiff",
    "audio/x-m4a": "audio/aac", // iPhone voice memos (AAC in m4a container)
    "audio/m4a": "audio/aac",
    "audio/mp4": "audio/aac",
    "audio/webm": "audio/webm", // not on the official list but accepted in practice
    "audio/ogg": "audio/ogg",
  };
  return map[m] ?? m ?? "audio/wav";
}
