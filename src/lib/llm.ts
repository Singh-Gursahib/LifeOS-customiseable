import "server-only";

/**
 * The single LLM provider for the whole app — agent loops (Ask + ingestion) AND
 * audio transcription, both on gemini-3.7-flash through OpenRouter's
 * OpenAI-compatible chat/completions API.
 *
 * It used to be split — a free model for the tool loops on its own key, a paid
 * Gemini for audio on another. The free model (inclusionai/ling-3.0-flash:free)
 * was delisted by OpenRouter and started 404-ing, taking Ask and ingestion down
 * with it. Now it is one model on one key (OPENROUTER_API_KEYS): predictable
 * spend in one place, and every request carries the same no-retention routing.
 * Extra comma-separated keys act purely as failover.
 *
 * src/lib/gemini.ts remains only as a transcription fallback if OpenRouter is
 * unreachable.
 *
 * Wire format (verified against the live API):
 *   request:  { model, messages, tools:[{type:"function",function:{name,description,parameters}}], tool_choice }
 *   response: choices[0].message.tool_calls[] = { id, type:"function", function:{ name, arguments:<JSON string> } }
 *   results:  { role:"tool", tool_call_id, content }
 * Parallel tool calls are supported (multiple entries in tool_calls).
 */

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

export const LLM_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash";

/**
 * The app's OpenRouter credentials — one list, used by every request (agent loops
 * and audio alike). Comma-separated so extra keys can be added purely as failover;
 * postChat() rotates to the next one on auth/quota errors.
 */
function apiKeys(): string[] {
  const seen = new Set<string>();
  const keys = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && !seen.has(k) && seen.add(k));
  if (!keys.length) throw new Error("Missing OPENROUTER_API_KEYS in .env.local");
  return keys;
}

export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** OpenAI-compatible message shapes we produce/consume. */
export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: RawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmTurn {
  text: string;
  toolCalls: LlmToolCall[];
  raw: { role: "assistant"; content?: string | null; tool_calls?: RawToolCall[] };
}

export interface LlmOptions {
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/** One chat completion, rotating keys on quota/auth errors and retrying transients. */
export async function llmChat(opts: LlmOptions): Promise<LlmTurn> {
  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  // These prompts carry the vault map and the raw capture text — the user's
  // journal in all but name. Same no-retention routing as the audio path.
  body.provider = { data_collection: "deny" };

  const { message: msg } = await postChat(body, apiKeys(), opts.timeoutMs ?? 45_000);
  const toolCalls: LlmToolCall[] = (msg.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function?.name ?? "",
    args: safeParse(c.function?.arguments),
  }));
  return {
    text: (msg.content ?? "").trim(),
    toolCalls,
    raw: { role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls },
  };
}

interface ChatMessageOut {
  content?: string | null;
  tool_calls?: RawToolCall[];
}

/** finish_reason travels with the message so callers can detect a cut-off reply. */
interface ChatResult {
  message: ChatMessageOut;
  finishReason: string | null;
}

/**
 * Low-level POST to OpenRouter with key rotation + transient retry.
 * Shared by the agent loops and audio transcription.
 */
async function postChat(body: Record<string, unknown>, keys: string[], timeoutMs: number): Promise<ChatResult> {
  let lastErr: unknown = new Error("OpenRouter request failed");
  for (const key of keys) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(OR_URL, {
          method: "POST",
          // Deliberately NO "HTTP-Referer" / "X-Title": those are optional
          // attribution headers that put the app name + URL on OpenRouter's
          // dashboard and public rankings. This is a private journal — requests
          // stay anonymous beyond the API key itself.
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          lastErr = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
          if (isRetryable(res.status) && attempt < 2) {
            await new Promise((r) => setTimeout(r, [1200, 4000][attempt]));
            continue;
          }
          break; // auth/quota — try the next key
        }
        const json = (await res.json()) as { choices?: { message?: ChatMessageOut; finish_reason?: string }[] };
        const choice = json.choices?.[0];
        if (!choice?.message) throw new Error("OpenRouter returned no message");
        return { message: choice.message, finishReason: choice.finish_reason ?? null };
      } catch (e) {
        lastErr = e;
        const aborted = e instanceof Error && e.name === "AbortError";
        if (!aborted && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr;
}

function safeParse(s?: string): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- audio ---
 * Transcription runs on a multimodal Gemini via OpenRouter. Wire format
 * (verified live): a user message whose content is an array of parts —
 *   { type: "text", text: "Transcribe this in English." }
 *   { type: "input_audio", input_audio: { data: <base64>, format: "wav" } }
 * Audio must be raw base64 (no data: URL). Supported formats: wav, mp3, aiff,
 * aac, ogg, flac, m4a, pcm16, pcm24.
 *
 * Reasoning is left at the provider's default. It cannot be turned off ("Reasoning
 * is mandatory for this endpoint"), and on 3.7 asking for a specific effort is
 * actively harmful — see the note on the request body below. The default costs
 * ~125 reasoning tokens per clip, which 3.7's halved pricing more than absorbs.
 * -------------------------------------------------------------------------- */

export const TRANSCRIBE_MODEL = process.env.OPENROUTER_TRANSCRIBE_MODEL || "google/gemini-3.7-flash";



/** Map a browser/file MIME type to an OpenRouter audio format string. */
export function audioFormatFor(mime: string, filename = ""): string {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  const byMime: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
  };
  if (byMime[m]) return byMime[m];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = { wav: "wav", mp3: "mp3", m4a: "m4a", aac: "aac", ogg: "ogg", flac: "flac", aiff: "aiff" };
  return byExt[ext] ?? "wav";
}

/**
 * Transcribe an audio clip. The prompt is exactly "Transcribe this in English."
 * so Hindi/Punjabi/English speech all come back as English text.
 */
export async function transcribeAudio(bytes: Buffer, format: string, timeoutMs = 55_000): Promise<string> {
  const body = {
    model: TRANSCRIBE_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this in English." },
          { type: "input_audio", input_audio: { data: bytes.toString("base64"), format } },
        ],
      },
    ],
    temperature: 0,
    // NOTE: do NOT add `reasoning: { effort }` here. On gemini-3.7-flash any
    // explicit reasoning effort makes the provider cut the reply off partway
    // with finish_reason "content_filter" — reproducibly, ~35 words of a
    // 34-second clip, with no error. Left off, the model reasons briefly by
    // default (~125 tokens) and still costs less per run than 3.6 did with
    // reasoning minimised, because 3.7 is half the price.
    // This carries the user's raw voice/journal content — the most sensitive
    // payload in the app. Route ONLY to providers that don't retain or train on
    // data. If no such provider is available the request fails rather than
    // silently leaking.
    provider: { data_collection: "deny" },
  };
  const { message, finishReason } = await postChat(body, apiKeys(), timeoutMs);
  // Rare (~1 in 20) but observed: the model's reasoning leaks into the content as a
  // bare leading "thought" line. Left in, it gets filed into the journal as if the
  // user had said it. Only an exact lone line is stripped, so real speech is safe.
  const text = (message.content ?? "").replace(/^\s*thought\s*\n+/i, "").trim();
  if (!text) throw new Error("The model returned an empty transcript");
  // A cut-off transcript is worse than a failed one: it looks like a complete
  // entry and quietly loses the rest of what was said. Refuse it instead.
  if (finishReason && finishReason !== "stop") {
    throw new Error(
      finishReason === "length"
        ? "The transcript hit the model's output limit — try a shorter clip."
        : `The transcript was cut short by the provider (${finishReason}) — tap Retry.`
    );
  }
  return text;
}

/** Human-readable errors for the UI. */
export function humanizeLlmError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "AbortError") return "The model took too long — try again in a moment.";
  if (/\b429\b|rate limit|quota/i.test(msg)) return "Rate limit reached on the model — wait a moment and retry.";
  if (/\b401\b|\b403\b|auth/i.test(msg)) return "The OpenRouter API key was rejected — check OPENROUTER_API_KEYS.";
  if (/\b5\d\d\b/.test(msg)) return "The model provider is having trouble right now — retry shortly.";
  return msg;
}
