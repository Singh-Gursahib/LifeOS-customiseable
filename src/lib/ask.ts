import "server-only";
import { llmChat, humanizeLlmError, LlmMessage } from "./llm";
import { supabaseServer } from "./supabase";
import { SpaceId } from "./session";
import { VAULT_TOOL_DECLARATIONS, executeVaultTool, toOpenAiTools } from "./agent-tools";
import { todayParts } from "./vault";

/**
 * The Ask assistant: a read-only agent loop over the vault (grep / search / read
 * → decide → answer), optimized the way coding agents keep tool loops fast:
 *   1. PARALLEL tool calls — the model batches N calls per turn; we run them
 *      concurrently (Promise.all) instead of one-at-a-time.
 *   2. Stable system-prompt prefix so Gemini's implicit cache kicks in across turns.
 *   3. Minimal thinking + a total time budget so it fits the 60s function cap.
 * Streams tool-call events so the UI shows live telemetry, then the answer.
 */

const READ_ONLY_TOOLS = new Set(["list_files", "read_file", "grep", "keyword_search"]);
const READ_TOOLS = toOpenAiTools(VAULT_TOOL_DECLARATIONS.filter((d) => READ_ONLY_TOOLS.has(d.name ?? "")));
const MAX_STEPS = 5; // with parallel batching, good answers resolve in 1-3 turns
const BUDGET_MS = 52_000; // stay under the platform's 60s function cap

export interface AskEvent {
  type: "tool" | "answer" | "sources" | "error" | "done";
  tool?: string;
  detail?: string;
  text?: string;
  paths?: string[];
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

async function vaultMapBrief(space: SpaceId): Promise<string> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("path,frontmatter").eq("space", space).order("path");
  return (data ?? [])
    .map((d) => {
      const fm = d.frontmatter as Record<string, unknown>;
      const s = typeof fm?.summary === "string" ? ` — ${(fm.summary as string).slice(0, 90)}` : "";
      return `${d.path}${s}`;
    })
    .join("\n");
}

function systemPrompt(todayIso: string, map: string): string {
  return `You are the LifeOS assistant — the user's personal archivist. You answer questions about
their life from their markdown vault, using the tools. Today is ${todayIso}.

THE VAULT (paths + summaries):
${map}

HOW TO WORK (be efficient — you run on a time budget)
- You can call MULTIPLE tools in ONE turn and they execute in parallel. BATCH them: in your
  first turn, issue every search/read you think you'll need at once (e.g. a grep for a name AND a
  keyword_search for the concept AND read_file on the 1-2 files the map points to). Don't drip one
  call per turn. Aim to answer within 1-2 turns.
- grep and keyword_search already return matching lines/snippets with paths — often that's enough
  to answer without a read_file. Only read_file when you truly need the full note.
- The map's summaries usually tell you exactly which file holds the answer — go straight there.
- Ground every claim in what you actually read. If the vault doesn't contain the answer, say so
  plainly — never invent memories.
- Dates matter: prefer the most recent dated section; say when something happened ("July 5, two
  days ago").

HOW TO ANSWER
- Warm, direct, second person ("You last called your mom on…"). 2-6 sentences for simple questions;
  use a short list for multi-part answers. No preamble.
- Cite the files you used at the end of the answer on one line: SOURCES: path1.md, path2.md
- Plain markdown (bold, lists). No wiki-link syntax in answers.`;
}

/** Run the ask loop, invoking onEvent for each streamed event. */
export async function runAsk(space: SpaceId, question: string, history: ChatTurn[], onEvent: (e: AskEvent) => void): Promise<void> {
  const { iso: todayIso } = todayParts();
  const map = await vaultMapBrief(space);
  const sys = systemPrompt(todayIso, map);

  // OpenAI-style message list; the system prompt stays first (stable prefix).
  const messages: LlmMessage[] = [
    { role: "system", content: sys },
    ...history.slice(-6).map((t) => ({ role: (t.role === "model" ? "assistant" : "user") as "assistant" | "user", content: t.text })),
    { role: "user", content: question },
  ];

  const sources = new Set<string>();
  const deadline = Date.now() + BUDGET_MS;

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) break; // out of budget → fall through to the graceful message

      const res = await llmChat({ messages, tools: READ_TOOLS, temperature: 0.3, timeoutMs: remaining });
      const calls = res.toolCalls;

      if (!calls.length) {
        const answer = res.text;
        const m = answer.match(/\nSOURCES:\s*(.+)\s*$/i);
        const cleaned = m ? answer.slice(0, m.index).trim() : answer;
        const cited = m ? m[1].split(",").map((s) => s.trim().replace(/[.\s]+$/, "")).filter(Boolean) : [];
        cited.forEach((p) => sources.add(p));
        onEvent({ type: "answer", text: cleaned || "I couldn't find anything about that in your vault." });
        onEvent({ type: "sources", paths: [...sources].slice(0, 8) });
        onEvent({ type: "done" });
        return;
      }

      messages.push(res.raw); // the assistant turn carrying tool_calls

      // surface all tool calls immediately, then execute them IN PARALLEL
      calls.forEach((c) =>
        onEvent({
          type: "tool",
          tool: c.name,
          detail: String(c.args.pattern ?? c.args.query ?? c.args.path ?? c.args.folder ?? "").slice(0, 80),
        })
      );
      const results = await Promise.all(calls.map((c) => executeVaultTool(space, c.name, c.args)));

      calls.forEach((c, idx) => {
        if (c.name === "read_file" && results[idx].ok && typeof c.args.path === "string") sources.add(c.args.path);
        // each tool result goes back keyed by its tool_call_id
        messages.push({ role: "tool", tool_call_id: c.id, content: results[idx].result.slice(0, 8000) });
      });
    }
    // ran out of budget or steps without a final answer
    onEvent({ type: "error", text: "That took longer than expected — ask again in a moment." });
    onEvent({ type: "done" });
  } catch (err) {
    onEvent({ type: "error", text: humanizeLlmError(err) });
    onEvent({ type: "done" });
  }
}
