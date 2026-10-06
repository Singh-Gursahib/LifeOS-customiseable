"use client";

import { useCallback, useEffect, useState } from "react";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/**
 * The gate. Four digits, no hints: the pad looks and behaves identically whichever
 * PIN is entered, and a wrong one says only ACCESS DENIED. Nothing here — not the
 * markup, not the response, not the timing — reveals that a second vault exists.
 */
export default function PinPad() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "denied" | "granted">("idle");
  const [error, setError] = useState("");

  const submit = useCallback(
    async (value: string) => {
      setState("checking");
      setError("");
      try {
        const res = await fetch("/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) {
          setState("granted");
          // Full reload rather than router.push: every page is rendered per-space,
          // so nothing from a previous session should survive in the client cache.
          window.location.replace("/");
          return;
        }
        setState("denied");
        setError(data.error || "ACCESS DENIED");
        // let the denial land visibly before clearing
        setTimeout(() => {
          setPin("");
          setState("idle");
        }, 900);
      } catch {
        setState("denied");
        setError("CONNECTION FAILED");
        setTimeout(() => {
          setPin("");
          setState("idle");
        }, 900);
      }
    },
    []
  );

  const push = useCallback(
    (digit: string) => {
      if (state === "checking" || state === "granted") return;
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) void submit(next);
        return next;
      });
    },
    [state, submit]
  );

  const back = useCallback(() => {
    if (state === "checking" || state === "granted") return;
    setPin((p) => p.slice(0, -1));
    setError("");
  }, [state]);

  // hardware keyboard, for desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push, back]);

  const busy = state === "checking" || state === "granted";

  return (
    <div style={{ width: "min(340px, 100%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
        <span style={{ width: 15, height: 15, background: "var(--acc)", display: "block", flex: "none" }} aria-hidden />
        <span className="font-display" style={{ fontWeight: 700, letterSpacing: "0.22em", fontSize: 22 }}>
          LIFEOS
        </span>
      </div>

      <div className="label" style={{ fontSize: 8.5, marginBottom: 18, color: "var(--color-faint)" }}>
        {state === "granted" ? "ACCESS GRANTED" : "ENTER ACCESS CODE"}
      </div>

      {/* dots */}
      <div
        className={state === "denied" ? "pin-shake" : undefined}
        style={{ display: "flex", gap: 14, marginBottom: 10 }}
        aria-live="polite"
        aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          const denied = state === "denied";
          return (
            <span
              key={i}
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${denied ? "var(--color-danger)" : filled ? "var(--acc)" : "var(--color-line-2)"}`,
                background: filled ? (denied ? "var(--color-danger)" : "var(--acc)") : "transparent",
                boxShadow: filled && !denied ? "0 0 12px rgba(255,98,0,0.5)" : "none",
                transition: "background 0.12s ease, border-color 0.12s ease",
              }}
            />
          );
        })}
      </div>

      {/* status line — fixed height so the pad never jumps */}
      <div
        className="font-data"
        style={{
          minHeight: 16,
          marginBottom: 16,
          maxWidth: "100%",
          textAlign: "center",
          lineHeight: 1.6,
          fontSize: 9,
          letterSpacing: "0.2em",
          color: error ? "var(--color-danger)" : "var(--color-faint)",
        }}
      >
        {state === "checking" ? "VERIFYING…" : error}
      </div>

      {/* keypad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%", opacity: busy ? 0.45 : 1, transition: "opacity 0.15s ease" }}>
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => (k === "⌫" ? back() : push(k))}
              className="font-display pin-key"
              aria-label={k === "⌫" ? "Delete" : k}
              style={{
                height: 62,
                border: "1px solid var(--color-line)",
                background: "var(--color-panel)",
                color: k === "⌫" ? "var(--color-dim)" : "var(--color-fg)",
                fontSize: k === "⌫" ? 20 : 26,
                fontWeight: 500,
                letterSpacing: "0.04em",
              }}
            >
              {k}
            </button>
          )
        )}
      </div>

      <div className="font-data" style={{ marginTop: 22, fontSize: 8, letterSpacing: "0.24em", color: "var(--color-faint)" }}>
        LOCAL SESSION · 30 DAYS
      </div>
    </div>
  );
}
