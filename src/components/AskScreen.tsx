"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SendIcon } from "./Icons";

interface Msg {
  role: "user" | "model";
  text: string;
  sources?: string[];
  trace?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  "When is my algorithms midterm?",
  "How much have I spent lately?",
  "What did we do for Ana's birthday?",
  "Who am I working with on the databases project?",
];

const TOOL_LABEL: Record<string, string> = {
  grep: "GREP",
  keyword_search: "SEARCH",
  read_file: "READ",
  list_files: "LIST",
};

export default function AskScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, trace]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setTrace([]);
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: question }]);

    const liveTrace: string[] = [];
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answered = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5)) as {
            type: string;
            tool?: string;
            detail?: string;
            text?: string;
            paths?: string[];
          };
          if (ev.type === "tool") {
            const label = TOOL_LABEL[ev.tool ?? ""] ?? ev.tool?.toUpperCase();
            liveTrace.push(`${label} ${ev.detail ?? ""}`.trim());
            setTrace([...liveTrace]);
          } else if (ev.type === "answer" || ev.type === "error") {
            answered = true;
            setMsgs((prev) => [
              ...prev,
              { role: "model", text: ev.text ?? "", trace: [...liveTrace], error: ev.type === "error" },
            ]);
            setTrace([]);
          } else if (ev.type === "sources" && ev.paths?.length) {
            setMsgs((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "model") last.sources = ev.paths;
              return next;
            });
          }
        }
      }
      if (!answered) {
        setMsgs((prev) => [...prev, { role: "model", text: "The connection dropped mid-search — ask again.", error: true }]);
      }
    } catch (err) {
      setMsgs((prev) => [
        ...prev,
        { role: "model", text: `Request failed: ${err instanceof Error ? err.message : err}`, error: true, trace: liveTrace },
      ]);
      setTrace([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - var(--tabbar-h) - var(--safe-bottom) - 60px)" }}>
      {/* Thread */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.length === 0 && (
          <div className="panel ticks" style={{ padding: 18, marginTop: 8 }}>
            <div className="label" style={{ color: "var(--acc)" }}>ARCHIVIST ONLINE</div>
            <p style={{ fontSize: 12.5, color: "var(--color-dim)", margin: "8px 0 14px", lineHeight: 1.6 }}>
              Ask anything about your life — I search the vault (grep, full-text, file reads) and answer with sources.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="font-body"
                  style={{ textAlign: "left", border: "1px solid var(--color-line)", padding: "9px 12px", fontSize: 12.5, color: "var(--color-fg)" }}
                >
                  <span style={{ color: "var(--acc)", marginRight: 8 }}>▸</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--acc)", color: "#050505", padding: "9px 13px", fontSize: 13, fontWeight: 500 }}>
              {m.text}
            </div>
          ) : (
            <div key={i} style={{ alignSelf: "stretch" }}>
              {m.trace && m.trace.length > 0 && <TraceBlock lines={m.trace} done />}
              <div
                className="panel"
                style={{ padding: "11px 13px", borderLeft: m.error ? "2px solid var(--color-danger)" : "2px solid var(--acc)" }}
              >
                <div className="prose" style={{ fontSize: 13 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--color-line)" }}>
                    {m.sources.map((p) => (
                      <Link
                        key={p}
                        href={`/vault/${p.replace(/\.md$/, "")}`}
                        className="font-data"
                        style={{ fontSize: 8.5, letterSpacing: "0.06em", color: "var(--acc)", border: "1px solid var(--acc-line)", padding: "3px 7px" }}
                      >
                        {p}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {busy && <TraceBlock lines={trace.length ? trace : ["SCANNING VAULT"]} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        style={{ position: "sticky", bottom: 0, display: "flex", gap: 8, paddingTop: 14, background: "linear-gradient(180deg, transparent, var(--color-bg) 30%)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Searching…" : "Ask your vault anything…"}
          disabled={busy}
          className="font-body"
          style={{ flex: 1, background: "var(--color-panel-2)", border: "1px solid var(--color-line-2)", padding: "12px 13px", fontSize: 13, color: "var(--color-fg)", outline: "none" }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className={input.trim() && !busy ? "glow" : ""}
          style={{ width: 46, background: input.trim() && !busy ? "var(--acc)" : "var(--color-panel-2)", color: input.trim() && !busy ? "#050505" : "var(--color-faint)", display: "grid", placeItems: "center" }}
        >
          <SendIcon size={17} />
        </button>
      </form>
    </div>
  );
}

function TraceBlock({ lines, done }: { lines: string[]; done?: boolean }) {
  return (
    <div className="font-data" style={{ padding: "4px 2px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 9, letterSpacing: "0.1em", color: done ? "var(--color-faint)" : "var(--acc)" }}>
          <span style={{ marginRight: 6 }}>{done ? "▸" : i === lines.length - 1 ? "▸" : "✓"}</span>
          {l}
          {!done && i === lines.length - 1 && <span className="blink" style={{ marginLeft: 4 }}>▮</span>}
        </div>
      ))}
    </div>
  );
}
