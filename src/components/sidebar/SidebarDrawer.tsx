"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import { HomeIcon, VaultIcon, GraphIcon, AskIcon, RecIcon, HeartIcon, LockIcon } from "../Icons";

const MODULES = [
  { href: "/learn", label: "LEARNING SPACE", desc: "Curated, dense reads", code: "LRN", live: true },
];

const QUICK = [
  { href: "/", label: "HOME", icon: HomeIcon },
  { href: "/vault", label: "VAULT", icon: VaultIcon },
  { href: "/capture", label: "CAPTURE", icon: RecIcon },
  { href: "/graph", label: "GRAPH", icon: GraphIcon },
  { href: "/ask", label: "ASK", icon: AskIcon },
];

const COMING = ["CALENDAR", "WEEKLY REPORTS", "MONTHLY REPORTS", "HABITS"];

/**
 * `isPrivate` gates the one control that must never exist in the decoy: the heart
 * that opens access settings. It is resolved on the server (AppShell), so the decoy
 * never ships the markup at all — there is nothing to find in the DOM.
 */
export default function SidebarDrawer({ isPrivate = false }: { isPrivate?: boolean }) {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const [locking, setLocking] = useState(false);

  const lock = async () => {
    setLocking(true);
    await fetch("/api/auth/lock", { method: "POST" }).catch(() => {});
    window.location.replace("/lock");
  };

  // close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // lock scroll + escape to close while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      />

      {/* drawer */}
      <aside
        role="dialog"
        aria-label="Command sidebar"
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 61,
          width: "min(300px, 84vw)",
          background: "#070708",
          borderRight: "1px solid var(--color-line-2)",
          boxShadow: open ? "0 0 60px rgba(0,0,0,0.7), 24px 0 60px rgba(255,98,0,0.03)" : "none",
          transform: open ? "translateX(0)" : "translateX(-102%)",
          transition: "transform 0.26s cubic-bezier(0.22,0.7,0.2,1)",
          display: "flex",
          flexDirection: "column",
          paddingTop: "var(--safe-top)",
          overflowY: "auto",
        }}
      >
        {/* brand */}
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 13, height: 13, background: "var(--acc)", display: "block", flex: "none" }} aria-hidden />
          <div style={{ flex: 1 }}>
            <div className="font-display" style={{ fontWeight: 700, letterSpacing: "0.18em", fontSize: 16 }}>
              LIFEOS
            </div>
            <div className="label" style={{ fontSize: 8 }}>COMMAND SIDEBAR</div>
          </div>
          {isPrivate && (
            <Link
              href="/settings"
              aria-label="Access settings"
              title="Access"
              style={{
                display: "grid",
                placeItems: "center",
                width: 30,
                height: 30,
                flex: "none",
                border: "1px solid var(--color-line)",
                color: "var(--acc)",
              }}
            >
              <HeartIcon size={15} filled />
            </Link>
          )}
        </div>

        {/* modules */}
        <div style={{ padding: "14px 12px 8px" }}>
          <div className="seclabel" style={{ marginBottom: 8 }}>
            MODULES <em>{"// "}ONLINE</em>
          </div>
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="panel ticks"
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 12px", marginBottom: 6 }}
            >
              <span className="font-data" style={{ fontSize: 9, color: "var(--acc)", border: "1px solid var(--acc-line)", padding: "3px 6px", flex: "none" }}>
                {m.code}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="font-display" style={{ display: "block", fontWeight: 700, letterSpacing: "0.08em", fontSize: 15 }}>
                  {m.label}
                </span>
                <span className="font-data" style={{ fontSize: 9, color: "var(--color-dim)", letterSpacing: "0.06em" }}>
                  {m.desc}
                </span>
              </span>
              <span style={{ color: "var(--acc)" }}>▸</span>
            </Link>
          ))}
        </div>

        {/* quick nav */}
        <div style={{ padding: "6px 12px 8px" }}>
          <div className="seclabel" style={{ marginBottom: 8 }}>
            QUICK NAV
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {QUICK.map((q) => {
              const Icon = q.icon;
              const active = q.href === "/" ? pathname === "/" : pathname.startsWith(q.href);
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className="font-data"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 10px",
                    border: active ? "1px solid var(--acc-line)" : "1px solid var(--color-line)",
                    color: active ? "var(--acc)" : "var(--color-dim)",
                    fontSize: 9.5,
                    letterSpacing: "0.12em",
                  }}
                >
                  <Icon size={15} />
                  {q.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* coming online */}
        <div style={{ padding: "6px 12px 20px", marginTop: "auto" }}>
          <div className="seclabel" style={{ marginBottom: 8 }}>
            QUEUED <em>{"// "}COMING ONLINE</em>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {COMING.map((c) => (
              <div
                key={c}
                className="font-data"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 10px",
                  border: "1px dashed var(--color-line)",
                  color: "var(--color-faint)",
                  fontSize: 9.5,
                  letterSpacing: "0.12em",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-line-2)", flex: "none" }} />
                <span style={{ flex: 1 }}>{c}</span>
                <span style={{ fontSize: 8, letterSpacing: "0.2em" }}>SOON</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={lock}
            disabled={locking}
            className="font-data"
            style={{
              marginTop: 12,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px",
              border: "1px solid var(--color-line-2)",
              background: "transparent",
              color: "var(--color-dim)",
              fontSize: 9.5,
              letterSpacing: "0.18em",
            }}
          >
            <LockIcon size={13} />
            {locking ? "LOCKING…" : "LOCK"}
          </button>
        </div>
      </aside>
    </>
  );
}
