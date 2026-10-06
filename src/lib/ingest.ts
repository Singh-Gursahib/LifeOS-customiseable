import "server-only";
import { llmChat, humanizeLlmError, LLM_MODEL, LlmMessage, LlmToolDef } from "./llm";
import { supabaseServer, CaptureRow } from "./supabase";
import { SpaceId } from "./session";
import { VAULT_TOOL_DECLARATIONS, executeVaultTool, toOpenAiTools, ToolResult } from "./agent-tools";
import { buildIngestSystemPrompt, buildIngestUserPrompt } from "./ingest-prompt";
import { todayParts } from "./vault";

/**
 * Agentic ingestion — the grep/read/edit/write → decide loop, optimized the way
 * coding agents keep tool loops fast (matching the Ask tab):
 *   1. PARALLEL tool execution — the model batches its reads/writes into one turn;
 *      reads run concurrently, writes run serially (safe against same-file races).
 *   2. Stable system-prompt prefix (cheap/cacheable across turns).
 *   3. A total time budget so it fits the 60s function cap and fails cleanly
 *      (→ retryable) instead of being hard-killed and left stuck.
 * Runs on the OpenRouter model via src/lib/llm.ts (sub-second tool round-trips);
 * Gemini is reserved for audio transcription.
 */

const FINISH_TOOL: LlmToolDef = {
  name: "finish",
  description: "Call once all three passes are complete. Ends the ingestion run.",
  parameters: {
    type: "object",
    properties: { summary: { type: "string", description: "2-3 sentences: what you filed where." } },
    required: ["summary"],
  },
};

const INGEST_TOOLS: LlmToolDef[] = [...toOpenAiTools(VAULT_TOOL_DECLARATIONS), FINISH_TOOL];

const MAX_STEPS = 6; // with batched parallel calls, a capture files in ~2-3 turns
const BUDGET_MS = 52_000; // stay under the platform's 60s function cap
const WRITE_TOOLS = new Set(["edit_file", "write_file", "append_section"]);

export interface IngestOutcome {
  ok: boolean;
  summary: string;
  filesTouched: string[];
  steps: number;
  error?: string;
}

async function buildVaultMap(space: SpaceId): Promise<string> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("path,frontmatter,content").eq("space", space).order("path");
  const lines: string[] = [];
  const indexes: string[] = [];
  for (const d of data ?? []) {
    const fm = d.frontmatter as Record<string, unknown>;
    const summary = typeof fm?.summary === "string" ? ` — ${fm.summary}` : "";
    lines.push(`${d.path}${summary}`);
    if (String(d.path).endsWith("_index.md") && String(d.path).split("/").length <= 2) {
      const body = String(d.content).replace(/^---[\s\S]*?---\n/, "").trim();
      indexes.push(`<index path="${d.path}">\n${body}\n</index>`);
    }
  }
  return `FILES:\n${lines.join("\n")}\n\nTOP-LEVEL INDEX CONTENTS:\n${indexes.join("\n\n")}`;
}

/**
 * Guards around every tool call:
 *  - write_file must never clobber an existing note → steer to append_section
 *  - a write that was already made in this run is a no-op (the model sometimes
 *    re-issues its whole batch, which previously duplicated index lines and
 *    burned turns on "already exists" failures)
 */
async function guardedExecute(
  space: SpaceId,
  name: string,
  args: Record<string, unknown>,
  touched: Set<string>,
  applied: Set<string>
): Promise<ToolResult> {
  if (WRITE_TOOLS.has(name)) {
    const sig = `${name}|${String(args.path ?? "")}|${hash(String(args.content ?? args.new_string ?? ""))}`;
    if (applied.has(sig)) {
      return { ok: true, result: `Already applied earlier in this run — skipped (no duplicate written). Move on.` };
    }
    applied.add(sig);
  }
  if (name === "write_file" && typeof args.path === "string") {
    const sb = supabaseServer();
    const { data } = await sb.from("documents").select("path").eq("space", space).eq("path", args.path).maybeSingle();
    if (data) {
      return { ok: false, result: `'${args.path}' already exists — use append_section to add a dated block instead of overwriting it.` };
    }
  }
  return executeVaultTool(space, name, args, touched);
}

/** Cheap non-crypto hash so identical repeated writes collapse to one signature. */
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

/** Progress events streamed to the UI while a capture is being filed. */
export interface IngestEvent {
  type: "tool" | "done" | "error";
  tool?: string;
  path?: string;
  ok?: boolean;
  summary?: string;
  filesTouched?: string[];
  text?: string;
}

export async function ingestCapture(space: SpaceId, captureId: string, onEvent?: (e: IngestEvent) => void): Promise<IngestOutcome> {
  const emit = (e: IngestEvent) => {
    try {
      onEvent?.(e);
    } catch {
      /* never let a stream error abort the ingest */
    }
  };
  const sb = supabaseServer();
  const { data: capture } = await sb.from("captures").select("*").eq("space", space).eq("id", captureId).maybeSingle();
  if (!capture) return { ok: false, summary: "", filesTouched: [], steps: 0, error: "Capture not found" };
  const cap = capture as CaptureRow;
  if (cap.status === "ingested") return { ok: false, summary: "", filesTouched: [], steps: 0, error: "Already ingested" };

  await sb.from("captures").update({ status: "ingesting", error: null, ingest_started_at: new Date().toISOString() }).eq("space", space).eq("id", captureId);
  const { iso: todayIso } = todayParts();
  const touched = new Set<string>();
  const applied = new Set<string>();
  const log: unknown[] = [];
  const deadline = Date.now() + BUDGET_MS;

  try {
    const vaultMap = await buildVaultMap(space);
    const sys = buildIngestSystemPrompt({ todayIso, vaultMap });
    const messages: LlmMessage[] = [
      { role: "system", content: sys }, // stable prefix
      { role: "user", content: buildIngestUserPrompt(cap) },
    ];
    let finishSummary = "";

    for (let i = 0; i < MAX_STEPS; i++) {
      const remaining = deadline - Date.now();
      if (remaining < 5000) throw new Error("__timeout__");

      const res = await llmChat({ messages, tools: INGEST_TOOLS, temperature: 0.3, timeoutMs: remaining });
      const calls = res.toolCalls;
      if (calls.length === 0) {
        finishSummary = res.text || finishSummary;
        break;
      }
      messages.push(res.raw);

      const specs = calls.map((c) => ({ id: c.id, name: c.name, args: c.args }));
      const results: (ToolResult | undefined)[] = new Array(specs.length);
      let finished = false;

      // reads run in parallel (safe); the finish call is a no-op tool
      await Promise.all(
        specs.map(async (s, idx) => {
          if (s.name === "finish") {
            if (touched.size === 0) {
              // premature — the model read but hasn't written. Force the writes.
              results[idx] = {
                ok: false,
                result:
                  "You haven't filed anything yet. Do the writes NOW: append_section for the Pass A day note, one per Pass B domain note, and the Pass C index lines (write_file only for brand-new notes). Call finish only AFTER those succeed.",
              };
            } else {
              finishSummary = String(s.args.summary ?? "Done.");
              results[idx] = { ok: true, result: "acknowledged" };
              finished = true;
            }
          } else if (!WRITE_TOOLS.has(s.name)) {
            results[idx] = await guardedExecute(space, s.name, s.args, touched, applied);
            emit({ type: "tool", tool: s.name, path: String(s.args.path ?? s.args.pattern ?? s.args.query ?? ""), ok: results[idx]!.ok });
          }
        })
      );
      // writes run serially to avoid same-file read-modify-write races
      for (let idx = 0; idx < specs.length; idx++) {
        if (!WRITE_TOOLS.has(specs[idx].name)) continue;
        results[idx] = await guardedExecute(space, specs[idx].name, specs[idx].args, touched, applied);
        emit({ type: "tool", tool: specs[idx].name, path: String(specs[idx].args.path ?? ""), ok: results[idx]!.ok });
      }

      specs.forEach((s, idx) => {
        const r = results[idx] ?? { ok: false, result: "not executed" };
        log.push({ tool: s.name, args: summarizeArgs(s.args), ok: r.ok, note: r.ok ? undefined : r.result.slice(0, 160) });
        messages.push({ role: "tool", tool_call_id: s.id, content: `${r.ok ? "OK" : "ERROR"}: ${r.result}`.slice(0, 8000) });
      });
      if (finished) break;
    }

    const filesTouched = [...touched];
    if (!filesTouched.length) throw new Error("Nothing was filed — try again.");

    await sb
      .from("captures")
      .update({
        status: "ingested",
        ingested_at: new Date().toISOString(),
        ingested_by: LLM_MODEL,
        ingestion_log: log,
        files_touched: filesTouched,
      })
      .eq("space", space)
      .eq("id", captureId);

    const summary = finishSummary || `Filed into ${filesTouched.length} files.`;
    emit({ type: "done", summary, filesTouched });
    return { ok: true, summary, filesTouched, steps: log.length };
  } catch (err) {
    // Writes are applied immediately, so if any already landed, keep them and mark
    // ingested (retrying would duplicate). Only a run that wrote nothing is retryable.
    if (touched.size) {
      await sb
        .from("captures")
        .update({ status: "ingested", ingested_at: new Date().toISOString(), ingested_by: `${LLM_MODEL} (partial)`, ingestion_log: log, files_touched: [...touched] })
        .eq("space", space)
        .eq("id", captureId);
      const summary = `Filed into ${touched.size} files (stopped early).`;
      emit({ type: "done", summary, filesTouched: [...touched] });
      return { ok: true, summary, filesTouched: [...touched], steps: log.length };
    }
    const msg = err instanceof Error && err.message === "__timeout__"
      ? "The model was too slow this time — tap Retry in a moment."
      : humanizeLlmError(err);
    await sb.from("captures").update({ status: "failed", error: msg.slice(0, 500), ingestion_log: log }).eq("space", space).eq("id", captureId);
    emit({ type: "error", text: msg });
    return { ok: false, summary: "", filesTouched: [], steps: log.length, error: msg };
  }
}

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === "string" && v.length > 100 ? `${v.slice(0, 100)}… (${v.length})` : v;
  return out;
}
