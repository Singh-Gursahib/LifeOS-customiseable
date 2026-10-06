import "server-only";
import { FunctionDeclaration, Type } from "@google/genai";
import { supabaseServer } from "./supabase";
import { SpaceId } from "./session";
import { saveDocument } from "./mutations";

/**
 * Vault tools shared by the ingestion agent (Phase 2) and the assistant
 * (Phase 3) — modeled on coding-agent primitives: list, read, grep,
 * keyword search, targeted edit, full write.
 */

export interface ToolResult {
  ok: boolean;
  result: string;
}

/**
 * Convert the Gemini-style declarations below into OpenAI/OpenRouter tool defs
 * (one source of truth for both providers). Gemini uses UPPERCASE Type enums;
 * JSON Schema wants lowercase type names.
 */
export function toOpenAiTools(decls: FunctionDeclaration[]): { name: string; description: string; parameters: Record<string, unknown> }[] {
  const lower = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(lower);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = k === "type" && typeof val === "string" ? val.toLowerCase() : lower(val);
      }
      return out;
    }
    return v;
  };
  return decls.map((d) => ({
    name: d.name ?? "",
    description: d.description ?? "",
    parameters: (lower(d.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>) ?? {},
  }));
}

export const VAULT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_files",
    description:
      "List vault files with title + one-line summary. Optionally scope to a folder prefix (e.g. 'journal' or 'people/friends').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        folder: { type: Type.STRING, description: "Folder prefix filter. Omit for the whole vault." },
      },
    },
  },
  {
    name: "read_file",
    description: "Read the full markdown content of one vault file by exact path (e.g. 'health/fitness.md').",
    parameters: {
      type: Type.OBJECT,
      properties: { path: { type: Type.STRING, description: "Exact vault path ending in .md" } },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description:
      "Search file contents with a case-insensitive regular expression (or plain substring). Returns matching lines with paths and line numbers. Use to find where something is mentioned.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: { type: Type.STRING, description: "Regex or plain text, case-insensitive" },
        folder: { type: Type.STRING, description: "Optional folder prefix to scope the search" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "keyword_search",
    description:
      "Full-text search over titles + content (stemmed, ranked). Better than grep for concepts ('surgery', 'investor call'); grep is better for exact strings.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "Search terms" } },
      required: ["query"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string. old_string must appear EXACTLY ONCE in the file — include enough surrounding lines to make it unique. Preferred for appending dated sections: match the end of the section you're extending.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING },
        old_string: { type: Type.STRING, description: "Exact existing text (unique in file)" },
        new_string: { type: Type.STRING, description: "Replacement text" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "append_section",
    description:
      "Append a markdown block to the END of an existing note (creates the file if missing) — needs NO prior read, unlike edit_file. This is the FAST way to file: use it for a day-note dated section, a Pass-B one-line domain bullet, or a Pass-C index line. Content is just the block to add (e.g. '## 2026-07-14\\n- ...').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Vault path ending in .md" },
        content: { type: Type.STRING, description: "The markdown block to append to the end of the file" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "write_file",
    description:
      "Create a BRAND-NEW file with complete markdown including YAML frontmatter (title, created, updated, tags, summary). For existing files use append_section instead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Vault path ending in .md, folders auto-created" },
        content: { type: Type.STRING, description: "Full file content with frontmatter" },
      },
      required: ["path", "content"],
    },
  },
];

/**
 * Execute a vault tool call inside one space. Writes are recorded into touchedPaths.
 * The agent never chooses the space — it is bound from the session, so a capture
 * filed in one vault can neither read nor write the other.
 */
export async function executeVaultTool(
  space: SpaceId,
  name: string,
  args: Record<string, unknown>,
  touchedPaths?: Set<string>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_files":
        return { ok: true, result: await listFiles(space, str(args.folder)) };
      case "read_file":
        return await readFile(space, str(args.path) ?? "");
      case "grep":
        return { ok: true, result: await grep(space, str(args.pattern) ?? "", str(args.folder)) };
      case "keyword_search":
        return { ok: true, result: await keywordSearch(space, str(args.query) ?? "") };
      case "edit_file": {
        const res = await editFile(space, str(args.path) ?? "", str(args.old_string) ?? "", str(args.new_string) ?? "");
        if (res.ok) touchedPaths?.add(str(args.path)!);
        return res;
      }
      case "write_file": {
        const path = str(args.path) ?? "";
        await saveDocument(space, path, str(args.content) ?? "");
        touchedPaths?.add(path);
        return { ok: true, result: `Wrote ${path}.` };
      }
      case "append_section": {
        const res = await appendSection(space, str(args.path) ?? "", str(args.content) ?? "");
        if (res.ok) touchedPaths?.add(str(args.path)!);
        return res;
      }
      default:
        return { ok: false, result: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, result: err instanceof Error ? err.message : String(err) };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

async function listFiles(space: SpaceId, folder?: string): Promise<string> {
  const sb = supabaseServer();
  let q = sb.from("documents").select("path,title,frontmatter").eq("space", space).order("path");
  if (folder) q = q.like("path", `${folder.replace(/\/$/, "")}%`);
  const { data } = await q;
  if (!data?.length) return folder ? `No files under '${folder}'.` : "Vault is empty.";
  return data
    .map((d) => {
      const fm = d.frontmatter as Record<string, unknown>;
      const summary = typeof fm?.summary === "string" ? ` — ${fm.summary}` : "";
      return `${d.path}${summary}`;
    })
    .join("\n");
}

async function readFile(space: SpaceId, path: string): Promise<ToolResult> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("content").eq("space", space).eq("path", path).maybeSingle();
  if (!data) {
    const suggestion = await nearestPaths(space, path);
    return { ok: false, result: `No file at '${path}'.${suggestion}` };
  }
  return { ok: true, result: data.content as string };
}

async function nearestPaths(space: SpaceId, path: string): Promise<string> {
  const sb = supabaseServer();
  const base = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  const { data } = await sb.from("documents").select("path").eq("space", space).ilike("path", `%${base.slice(0, 12)}%`).limit(4);
  return data?.length ? ` Did you mean: ${data.map((d) => d.path).join(", ")}` : "";
}

async function grep(space: SpaceId, pattern: string, folder?: string): Promise<string> {
  const sb = supabaseServer();
  let q = sb.from("documents").select("path,content").eq("space", space);
  if (folder) q = q.like("path", `${folder.replace(/\/$/, "")}%`);
  const { data } = await q;
  if (!data?.length) return "No files to search.";

  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const out: string[] = [];
  for (const d of data) {
    const lines = (d.content as string).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push(`${d.path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        if (out.length >= 40) return out.join("\n") + "\n… (truncated at 40 matches — narrow the pattern)";
      }
    }
  }
  return out.length ? out.join("\n") : `No matches for /${pattern}/i${folder ? ` under ${folder}` : ""}.`;
}

async function keywordSearch(space: SpaceId, query: string): Promise<string> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("documents")
    .select("path,title,content")
    .eq("space", space)
    .textSearch("fts", query, { type: "websearch", config: "english" })
    .limit(8);
  if (!data?.length) return `No full-text matches for '${query}'. Try grep with a simpler pattern.`;
  // Return a generous snippet around the best-matching query term so the model can
  // often answer straight from search results without a follow-up read_file.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return data
    .map((d) => {
      const body = (d.content as string).replace(/^---[\s\S]*?---\n/, "");
      const lower = body.toLowerCase();
      let idx = -1;
      for (const t of terms) {
        const at = lower.indexOf(t);
        if (at >= 0 && (idx === -1 || at < idx)) idx = at;
      }
      if (idx < 0) idx = 0;
      const snippet = body.slice(Math.max(0, idx - 140), idx + 340).replace(/\n{2,}/g, " ").trim();
      return `${d.path} — ${d.title}\n  …${snippet}…`;
    })
    .join("\n\n");
}

async function appendSection(space: SpaceId, path: string, content: string): Promise<ToolResult> {
  if (!/^[\w\-./ ]+\.md$/.test(path) || path.includes("..")) return { ok: false, result: `Invalid path: ${path}` };
  const block = content.trim();
  if (!block) return { ok: false, result: "Nothing to append." };
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("content").eq("space", space).eq("path", path).maybeSingle();
  const existing = (data as { content: string } | null)?.content;
  const next = existing ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
  await saveDocument(space, path, next);
  return { ok: true, result: `Appended to ${path}${existing ? "" : " (created)"}.` };
}

async function editFile(space: SpaceId, path: string, oldString: string, newString: string): Promise<ToolResult> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("content").eq("space", space).eq("path", path).maybeSingle();
  if (!data) return { ok: false, result: `No file at '${path}'. Use write_file to create it.` };
  const content = data.content as string;

  const count = content.split(oldString).length - 1;
  if (count === 0) {
    return {
      ok: false,
      result: `old_string not found in ${path}. Read the file and copy the exact text (whitespace matters).`,
    };
  }
  if (count > 1) {
    return {
      ok: false,
      result: `old_string appears ${count} times in ${path} — add surrounding lines to make it unique.`,
    };
  }
  await saveDocument(space, path, content.replace(oldString, newString));
  return { ok: true, result: `Edited ${path}.` };
}
