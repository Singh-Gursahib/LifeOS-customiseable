"use client";

import { useState } from "react";
import { changePinAction } from "@/app/settings/actions";
import { HeartIcon, LockIcon, CheckIcon } from "@/components/Icons";

type Target = "decoy" | "private";

const PANELS: { id: Target; title: string; sub: string; note: string }[] = [
  {
    id: "private",
    title: "PRIVATE ACCESS",
    sub: "THIS VAULT",
    note: "Opens the real journal — the one you're in now. Changing this signs nobody out; your current session stays valid.",
  },
  {
    id: "decoy",
    title: "DECOY ACCESS",
    sub: "COVER VAULT",
    note: "Opens the other vault: a complete, plausible journal that looks lived-in. Hand this code out; nothing here is reachable from it.",
  },
];

export default function SettingsScreen({ updated }: { updated: Record<string, string> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section className="panel ticks rise" style={{ padding: "14px 14px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--acc)", flex: "none" }}>
            <HeartIcon size={18} filled />
          </span>
          <div style={{ flex: 1 }}>
            <div className="font-display" style={{ fontWeight: 700, letterSpacing: "0.12em", fontSize: 17 }}>
              ACCESS CODES
            </div>
            <div className="font-data" style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
              TWO VAULTS · ONE SCREEN · FOUR DIGITS
            </div>
          </div>
        </div>
      </section>

      {PANELS.map((p) => (
        <PinPanel key={p.id} {...p} updatedAt={updated[p.id]} />
      ))}

      <LockNow />
    </div>
  );
}

function PinPanel({
  id,
  title,
  sub,
  note,
  updatedAt,
}: {
  id: Target;
  title: string;
  sub: string;
  note: string;
  updatedAt?: string;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 4);
  const ready = pin.length === 4 && confirm.length === 4 && !busy;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await changePinAction(id, pin, confirm);
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: "SAVED" });
      setPin("");
      setConfirm("");
      setTimeout(() => setMsg(null), 2600);
    } else {
      setMsg({ ok: false, text: res.error.toUpperCase() });
    }
  };

  return (
    <section className="panel rise" style={{ padding: "13px 14px 14px" }}>
      <div className="seclabel" style={{ marginBottom: 4 }}>
        {title} <em>{"// "}{sub}</em>
      </div>
      <p className="font-body" style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-dim)", margin: "6px 0 12px" }}>
        {note}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="NEW PIN" value={pin} onChange={(v) => setPin(digitsOnly(v))} />
        <Field label="CONFIRM" value={confirm} onChange={(v) => setConfirm(digitsOnly(v))} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11 }}>
        <button
          type="button"
          onClick={save}
          disabled={!ready}
          className="font-display"
          style={{
            flex: 1,
            padding: "10px 12px",
            border: `1px solid ${ready ? "var(--acc-line)" : "var(--color-line)"}`,
            background: ready ? "var(--acc)" : "transparent",
            color: ready ? "#050505" : "var(--color-faint)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            fontSize: 13,
          }}
        >
          {busy ? "SAVING…" : "SAVE"}
        </button>
        {msg && (
          <span
            className="font-data"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 9,
              letterSpacing: "0.14em",
              color: msg.ok ? "var(--acc)" : "var(--color-danger)",
              flex: "none",
              maxWidth: "58%",
              textAlign: "right",
            }}
          >
            {msg.ok && <CheckIcon size={12} />}
            {msg.text}
          </span>
        )}
      </div>

      {updatedAt && (
        <div className="font-data" style={{ marginTop: 9, fontSize: 8.5, letterSpacing: "0.16em", color: "var(--color-faint)" }}>
          LAST CHANGED {updatedAt.slice(0, 10)}
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span className="label" style={{ fontSize: 8, display: "block", marginBottom: 5 }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        type="password"
        placeholder="••••"
        className="font-data tabnum"
        style={{
          width: "100%",
          padding: "10px 11px",
          background: "var(--color-panel-2)",
          border: "1px solid var(--color-line)",
          color: "var(--color-fg)",
          fontSize: 17,
          letterSpacing: "0.4em",
        }}
      />
    </label>
  );
}

function LockNow() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/lock", { method: "POST" }).catch(() => {});
        window.location.replace("/lock");
      }}
      className="font-data"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px",
        border: "1px solid var(--color-line-2)",
        background: "transparent",
        color: "var(--color-dim)",
        fontSize: 10,
        letterSpacing: "0.2em",
      }}
    >
      <LockIcon size={14} />
      {busy ? "LOCKING…" : "LOCK NOW"}
    </button>
  );
}
