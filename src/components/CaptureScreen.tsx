"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WavRecorder } from "@/lib/recorder";
import { decodeToPcm, processToWavs } from "@/lib/audio";
import { createCaptureAction, deleteCaptureAction, refreshAfterIngest } from "@/app/capture/actions";
import { MicIcon, UploadIcon, BackIcon, CheckIcon } from "./Icons";

/** Surface the error's DOMException name too — that's the key to diagnosing device-specific failures. */
function describeErr(err: unknown): string {
  if (err instanceof Error) return err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message;
  return String(err);
}

interface CaptureItem {
  id: string;
  entry_date: string;
  source: string;
  raw_text: string;
  duration_sec: number | null;
  status: string;
  captured_at: string;
  files_touched: string[];
  error: string | null;
}

type Mode = "idle" | "recording" | "transcribing";
type Tab = "capture" | "drafts";

export default function CaptureScreen({ initialTab, captures }: { initialTab: Tab; captures: CaptureItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [srcMeta, setSrcMeta] = useState<{ source: "voice" | "text" | "upload"; duration?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [wave, setWave] = useState<number[]>(new Array(48).fill(0));
  const [busy, startTransition] = useTransition();
  const [chunkProg, setChunkProg] = useState<{ i: number; n: number } | null>(null);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  // A capture created in this session, shown immediately (the `captures` prop is
  // a server snapshot from page load and won't include it until a refresh).
  const [pendingCapture, setPendingCapture] = useState<CaptureItem | null>(null);
  const [ingestResult, setIngestResult] = useState<{ id: string; summary: string; files: string[] } | null>(null);

  const recRef = useRef<WavRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Merge the in-flight capture in front, de-duped once the server list catches up.
  const shown: CaptureItem[] = pendingCapture
    ? [pendingCapture, ...captures.filter((c) => c.id !== pendingCapture.id)]
    : captures;
  const draftCount = shown.filter((c) => c.status === "draft").length;

  useEffect(() => () => recRef.current?.cancel(), []);

  /* ---------- recording ---------- */
  const startRec = async () => {
    setError(null);
    try {
      const rec = new WavRecorder();
      rec.onTick = () => {
        setElapsed(rec.elapsedSec);
        setWave([...rec.wave]);
      };
      await rec.start();
      recRef.current = rec;
      setMode("recording");
    } catch (err) {
      setError(err instanceof Error && err.name === "NotAllowedError" ? "Microphone access denied — allow it in browser settings." : `Recorder failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  const stopRec = async () => {
    const rec = recRef.current;
    if (!rec) return;
    setMode("transcribing");
    let stage = "process";
    try {
      const { blobs, durationSec } = await rec.stop();
      stage = "upload";
      await transcribeChunks(blobs, "voice", durationSec);
    } catch (err) {
      console.error("[capture] record error", err);
      setError(`Transcription failed [${stage}]: ${describeErr(err)}`);
      setMode("idle");
      setChunkProg(null);
    }
  };

  const discardRec = () => {
    recRef.current?.cancel();
    recRef.current = null;
    setMode("idle");
    setElapsed(0);
    setWave(new Array(48).fill(0));
  };

  /* ---------- upload ---------- */
  const onFile = async (f: File | null) => {
    if (!f) return;
    setError(null);
    setMode("transcribing");
    try {
      // Condition the uploaded memo the same way as a recording: decode →
      // trim silence → 2x pitch-preserved → clean WAV, auto-chunked. Fall back
      // to the raw file if the browser can't decode this format.
      let blobs: Blob[] = [f];
      let duration: number | undefined;
      try {
        const { pcm, rate } = await decodeToPcm(f);
        const out = processToWavs(pcm, rate);
        blobs = out.blobs;
        duration = Math.round(out.stats.inSec);
      } catch {
        /* undecodable format — send the original bytes as-is */
      }
      await transcribeChunks(blobs, "upload", duration);
    } catch (err) {
      console.error("[capture] upload error", err);
      setError(`Transcription failed [upload]: ${describeErr(err)}`);
      setMode("idle");
      setChunkProg(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Vercel serverless caps the request body at ~4.5 MB.
  const MAX_UPLOAD = 4.4 * 1024 * 1024;

  /** Transcribe one or more audio chunks in order, stitching the transcripts together. */
  const transcribeChunks = async (blobs: Blob[], source: "voice" | "upload", duration?: number) => {
    const parts: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      if (blobs.length > 1) setChunkProg({ i: i + 1, n: blobs.length });
      parts.push(await transcribeOne(blobs[i], blobs.length > 1 ? `part${i + 1}.wav` : "recording.wav"));
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${joined}` : joined));
    setSrcMeta({ source, duration });
    setMode("idle");
    setChunkProg(null);
    setElapsed(0);
    setWave(new Array(48).fill(0));
  };

  const transcribeOne = async (blob: Blob, name: string): Promise<string> => {
    if (blob.size > MAX_UPLOAD) {
      throw new Error(`a chunk is ${(blob.size / 1024 / 1024).toFixed(1)}MB (limit 4.4MB) — this shouldn't happen, tell the dev`);
    }
    const fd = new FormData();
    fd.append("audio", blob, name);
    let res: Response;
    try {
      res = await fetch("/api/transcribe", { method: "POST", body: fd });
    } catch (e) {
      throw new Error(`network — ${describeErr(e)} (${(blob.size / 1024).toFixed(0)}KB, ${blob.type || "?"})`);
    }
    const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || json.text == null) {
      throw new Error(json.error ?? (res.status === 413 ? "clip too large" : `service error HTTP ${res.status}`));
    }
    return json.text;
  };

  /* ---------- save / ingest ---------- */
  const saveDraft = () => {
    setError(null);
    const body = text;
    const meta = srcMeta;
    startTransition(async () => {
      const res = await createCaptureAction({ raw_text: body, source: meta?.source ?? "text", duration_sec: meta?.duration ?? null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      setSrcMeta(null);
      setPendingCapture({
        id: res.id,
        entry_date: new Date().toISOString().slice(0, 10),
        source: meta?.source ?? "text",
        raw_text: body,
        duration_sec: meta?.duration ?? null,
        status: "draft",
        captured_at: new Date().toISOString(),
        files_touched: [],
        error: null,
      });
      setFlash("SAVED TO DRAFTS — INGEST ANYTIME");
      setTimeout(() => setFlash(null), 2400);
      router.refresh();
    });
  };

  const ingestNow = () => {
    setError(null);
    const body = text;
    const meta = srcMeta;
    startTransition(async () => {
      const res = await createCaptureAction({ raw_text: body, source: meta?.source ?? "text", duration_sec: meta?.duration ?? null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      setSrcMeta(null);
      // Show the entry in the drafts list immediately — the server list is a
      // snapshot from page load and won't contain it until a refresh lands.
      setPendingCapture({
        id: res.id,
        entry_date: new Date().toISOString().slice(0, 10),
        source: meta?.source ?? "text",
        raw_text: body,
        duration_sec: meta?.duration ?? null,
        status: "ingesting",
        captured_at: new Date().toISOString(),
        files_touched: [],
        error: null,
      });
      setTab("drafts");
      await runIngest(res.id);
    });
  };

  /** Stream the ingest so the filing is visible as it happens. */
  const runIngest = async (id: string) => {
    setIngesting(id);
    setIngestResult(null);
    setTrace([]);
    const live: string[] = [];
    let finished = false;
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId: id }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const raw of parts) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5)) as {
            type: string;
            tool?: string;
            path?: string;
            ok?: boolean;
            summary?: string;
            filesTouched?: string[];
            text?: string;
          };
          if (ev.type === "tool") {
            live.push(`${(ev.tool ?? "").toUpperCase()} ${ev.path ?? ""}${ev.ok === false ? " ✕" : ""}`.trim());
            setTrace([...live]);
          } else if (ev.type === "done") {
            finished = true;
            setIngestResult({ id, summary: ev.summary ?? "Filed.", files: ev.filesTouched ?? [] });
            setPendingCapture((p) =>
              p && p.id === id ? { ...p, status: "ingested", files_touched: ev.filesTouched ?? [] } : p
            );
          } else if (ev.type === "error") {
            finished = true;
            setError(ev.text ?? "Ingestion failed");
            setPendingCapture((p) => (p && p.id === id ? { ...p, status: "failed", error: ev.text ?? null } : p));
          }
        }
      }
      if (!finished) throw new Error("the connection dropped mid-ingest");
      await refreshAfterIngest();
      router.refresh();
    } catch (err) {
      setError(`Ingestion failed: ${err instanceof Error ? err.message : err}`);
      setPendingCapture((p) => (p && p.id === id ? { ...p, status: "failed" } : p));
      router.refresh();
    } finally {
      setIngesting(null);
      setTrace([]);
    }
  };

  const delDraft = (id: string) => {
    startTransition(async () => {
      await deleteCaptureAction(id);
      router.refresh();
    });
  };

  /* ================= RENDER ================= */
  return (
    <div className="app-shell">
      <main className="app-main" style={{ paddingBottom: 24 }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => router.push("/")} aria-label="Back to dashboard" className="panel" style={{ padding: 7 }}>
            <BackIcon size={18} />
          </button>
          <span className="font-display" style={{ fontWeight: 700, letterSpacing: "0.16em", fontSize: 16 }}>
            CAPTURE
          </span>
          <span className="label" style={{ flex: 1 }}>VOICE · TEXT · FILE</span>
          <div style={{ display: "flex", border: "1px solid var(--color-line)" }}>
            {(["capture", "drafts"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="font-data"
                style={{
                  padding: "6px 10px",
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  background: tab === t ? "var(--acc)" : "transparent",
                  color: tab === t ? "#050505" : "var(--color-dim)",
                }}
              >
                {t === "capture" ? "NEW" : `DRAFTS ${String(draftCount).padStart(2, "0")}`}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div style={{ border: "1px solid var(--color-danger)", background: "rgba(229,72,77,0.08)", padding: "9px 12px", fontSize: 11.5, color: "#ff9ea1", marginBottom: 12 }}>
            {error}
          </div>
        )}
        {flash && (
          <div className="font-data" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: "0.14em", color: "var(--acc)", marginBottom: 12 }}>
            <CheckIcon size={13} /> {flash}
          </div>
        )}

        {tab === "capture" ? (
          <>
            {/* Recorder module */}
            <section
              className={mode === "recording" ? "hazard-soft hazard-march" : "panel ticks"}
              style={{
                border: mode === "recording" ? "1px solid var(--acc)" : undefined,
                padding: 16,
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              {mode === "recording" ? (
                <>
                  <div className="font-data" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: "0.2em", color: "var(--acc)", marginBottom: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="blink" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--acc)", display: "inline-block" }} />
                      REC — LISTENING
                    </span>
                    <span className="tabnum" style={{ color: "var(--color-fg)", fontSize: 12 }}>{fmtTime(elapsed)}</span>
                  </div>
                  <Waveform bars={wave} live />
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={discardRec} className="font-data" style={{ flex: 1, border: "1px solid var(--color-line-2)", padding: "11px 0", fontSize: 10, letterSpacing: "0.18em", color: "var(--color-dim)" }}>
                      DISCARD
                    </button>
                    <button onClick={stopRec} className="font-display glow" style={{ flex: 2, background: "var(--acc)", color: "#050505", padding: "11px 0", fontWeight: 700, letterSpacing: "0.14em", fontSize: 14 }}>
                      STOP → TRANSCRIBE
                    </button>
                  </div>
                </>
              ) : mode === "transcribing" ? (
                <div style={{ padding: "18px 0" }}>
                  <div className="font-data" style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--acc)" }}>
                    <span className="blink">▮▮</span> TRANSCRIBING{chunkProg ? ` — PART ${chunkProg.i}/${chunkProg.n}` : " — GEMINI 3.5 FLASH"}
                  </div>
                  <div className="label" style={{ marginTop: 8 }}>
                    {chunkProg ? "LONG RECORDING — STITCHING PARTS" : "EN · हिंदी · ਪੰਜਾਬੀ → ENGLISH TEXT"}
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={startRec}
                    aria-label="Start recording"
                    className="glow"
                    style={{ width: 78, height: 78, background: "var(--acc)", color: "#050505", display: "inline-grid", placeItems: "center", position: "relative" }}
                  >
                    <span aria-hidden style={{ position: "absolute", inset: -6, border: "1px dashed var(--acc-line)" }} />
                    <MicIcon size={30} />
                  </button>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "0.12em", marginTop: 12 }}>
                    TAP TO RECORD
                  </div>
                  <div className="label" style={{ marginTop: 4 }}>SPEAK ENGLISH, HINDI OR PUNJABI — KEEPS LISTENING UNTIL YOU STOP</div>
                  <div style={{ marginTop: 14 }}>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="font-data panel"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}
                    >
                      <UploadIcon size={14} /> ATTACH VOICE MEMO (.M4A, .MP3, .WAV…)
                    </button>
                    <input ref={fileRef} type="file" accept="audio/*,.m4a" hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                  </div>
                </>
              )}
            </section>

            {/* Text editor */}
            <div className="seclabel" style={{ marginBottom: 8 }}>
              TEXT <em>{"// "}EDIT BEFORE FILING</em>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Transcript lands here — or just type. Edit freely before saving."
              spellCheck={false}
              className="font-body"
              style={{
                width: "100%",
                minHeight: 180,
                background: "var(--color-panel-2)",
                border: "1px solid var(--color-line)",
                padding: 12,
                fontSize: 13,
                lineHeight: 1.65,
                color: "var(--color-fg)",
                outline: "none",
                resize: "vertical",
              }}
            />
            <div className="font-data" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--color-faint)", letterSpacing: "0.1em", margin: "6px 0 14px" }}>
              <span>{text.length} CHARS{srcMeta?.source === "voice" ? ` · FROM VOICE (${srcMeta.duration ?? "?"}S)` : srcMeta?.source === "upload" ? " · FROM FILE" : ""}</span>
              {text && (
                <button onClick={() => { setText(""); setSrcMeta(null); }} style={{ color: "var(--color-faint)", letterSpacing: "0.14em", fontSize: 9 }}>
                  CLEAR
                </button>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveDraft}
                disabled={!text.trim() || busy}
                className="font-display"
                style={{
                  flex: 1,
                  border: "1px solid var(--acc-line)",
                  color: text.trim() ? "var(--acc)" : "var(--color-faint)",
                  padding: "13px 0",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: 14,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                SAVE DRAFT
              </button>
              <button
                onClick={ingestNow}
                disabled={!text.trim() || busy}
                className={text.trim() ? "font-display glow" : "font-display"}
                style={{
                  flex: 1,
                  background: text.trim() ? "var(--acc)" : "var(--color-panel-2)",
                  color: text.trim() ? "#050505" : "var(--color-faint)",
                  padding: "13px 0",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: 14,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                INGEST NOW ▸
              </button>
            </div>
            <p className="label" style={{ marginTop: 10, lineHeight: 1.8 }}>
              DRAFTS WAIT IN THE QUEUE — INGEST LATER IN-APP (GEMINI) OR OFFLINE WITH CLAUDE FOR IMPORTANT ENTRIES.
            </p>
          </>
        ) : (
          /* ================= DRAFTS TAB ================= */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shown.length === 0 && (
              <div className="panel" style={{ padding: 18, textAlign: "center", color: "var(--color-faint)", fontSize: 12 }}>
                Queue empty. Capture something first.
              </div>
            )}
            {shown.map((c) => (
              <div key={c.id} className="panel" style={{ borderLeft: c.status === "draft" ? "2px solid var(--acc)" : "1px solid var(--color-line)" }}>
                <div style={{ padding: "10px 12px" }}>
                  <div className="font-data" style={{ display: "flex", gap: 10, fontSize: 8.5, letterSpacing: "0.12em", color: "var(--color-faint)", marginBottom: 6 }}>
                    <span style={{ color: statusColor(c.status) }}>● {c.status.toUpperCase()}</span>
                    <span>{c.entry_date}</span>
                    <span>{c.source.toUpperCase()}{c.duration_sec ? ` ${c.duration_sec}S` : ""}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#cfcfca", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {c.raw_text}
                  </p>
                  {c.status === "ingested" && c.files_touched.length > 0 && ingestResult?.id !== c.id && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {c.files_touched.map((f) => (
                        <a
                          key={f}
                          href={`/vault/${f.replace(/\.md$/, "")}`}
                          className="font-data"
                          style={{ fontSize: 8.5, color: "var(--color-dim)", letterSpacing: "0.04em", border: "1px solid var(--color-line)", padding: "2px 6px" }}
                        >
                          {f}
                        </a>
                      ))}
                    </div>
                  )}
                  {c.error && <div style={{ marginTop: 6, fontSize: 10.5, color: "#ff9ea1" }}>{c.error}</div>}

                  {/* live: what the model is doing right now */}
                  {ingesting === c.id && (
                    <div style={{ marginTop: 9, borderLeft: "2px solid var(--acc)", background: "var(--acc-soft)", padding: "9px 11px" }}>
                      <div className="font-data" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--acc)", marginBottom: trace.length ? 6 : 0 }}>
                        <span className="blink">▮</span> INGESTING — FILING INTO YOUR VAULT
                      </div>
                      <div className="font-data" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {trace.map((t, i) => (
                          <div key={i} style={{ fontSize: 8.5, letterSpacing: "0.06em", color: i === trace.length - 1 ? "var(--color-fg)" : "var(--color-faint)" }}>
                            {i === trace.length - 1 ? "▸" : "✓"} {t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* after: what it actually added */}
                  {ingestResult?.id === c.id && ingesting !== c.id && (
                    <div style={{ marginTop: 9, borderLeft: "2px solid var(--acc)", background: "var(--acc-soft)", padding: "9px 11px" }}>
                      <div className="font-data" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--acc)", marginBottom: 5 }}>
                        FILED — {ingestResult.files.length} FILE{ingestResult.files.length === 1 ? "" : "S"} UPDATED
                      </div>
                      <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--color-fg)" }}>{ingestResult.summary}</p>
                      {ingestResult.files.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          {ingestResult.files.map((f) => (
                            <a
                              key={f}
                              href={`/vault/${f.replace(/\.md$/, "")}`}
                              className="font-data"
                              style={{ fontSize: 8.5, letterSpacing: "0.04em", color: "var(--acc)", border: "1px solid var(--acc-line)", padding: "2px 6px" }}
                            >
                              {f}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {(c.status === "draft" || c.status === "failed") && (
                  <div style={{ display: "flex", borderTop: "1px solid var(--color-line)" }}>
                    <button
                      onClick={() => delDraft(c.id)}
                      disabled={busy || ingesting !== null}
                      className="font-data"
                      style={{ flex: 1, padding: "9px 0", fontSize: 9, letterSpacing: "0.18em", color: "var(--color-faint)" }}
                    >
                      DELETE
                    </button>
                    <button
                      onClick={() => runIngest(c.id)}
                      disabled={ingesting !== null}
                      className="font-data"
                      style={{
                        flex: 2,
                        padding: "9px 0",
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        background: ingesting === c.id ? "transparent" : "var(--acc)",
                        color: ingesting === c.id ? "var(--acc)" : "#050505",
                        fontWeight: 600,
                        borderLeft: "1px solid var(--color-line)",
                      }}
                    >
                      {ingesting === c.id ? "FILING…" : c.status === "failed" ? "RETRY INGEST ▸" : "INGEST ▸"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Waveform({ bars, live }: { bars: number[]; live?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 56, justifyContent: "center" }} aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: Math.max(3, b * 54),
            background: i === bars.length - 1 && live ? "#fff" : "var(--acc)",
            opacity: 0.35 + b * 0.65,
            transition: "height 60ms linear",
          }}
        />
      ))}
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "draft":
      return "var(--acc)";
    case "ingesting":
      return "#ffd75c";
    case "ingested":
      return "#9be29b";
    case "failed":
      return "var(--color-danger)";
    default:
      return "var(--color-faint)";
  }
}
