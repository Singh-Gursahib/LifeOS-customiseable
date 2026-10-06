"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { HomeIcon, VaultIcon, GraphIcon, AskIcon, RecIcon } from "./Icons";

const TABS = [
  { href: "/", label: "HOME", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/vault", label: "VAULT", icon: VaultIcon, match: (p: string) => p.startsWith("/vault") },
  { href: "/graph", label: "GRAPH", icon: GraphIcon, match: (p: string) => p.startsWith("/graph") },
  { href: "/ask", label: "ASK", icon: AskIcon, match: (p: string) => p.startsWith("/ask") },
];

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  // Optimistic highlight: light the tab on tap instead of waiting for the route
  // to commit, so the bar never feels laggy even while the page streams in. The
  // tap remembers which page it happened on, so it lapses by itself the moment
  // the route actually changes — no effect needed to clear it.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  if (pathname.startsWith("/capture")) return null; // capture is a focused full-screen flow

  const active = pending && pending.from === pathname ? pending.href : pathname;
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        zIndex: 40,
        background: "rgba(7,7,8,0.94)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--color-line)",
        paddingBottom: "var(--safe-bottom)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 72px 1fr 1fr",
          alignItems: "center",
          height: "var(--tabbar-h)",
        }}
      >
        {left.map((t) => (
          <TabLink key={t.href} tab={t} active={t.match(active)} onTap={() => setPending({ href: t.href, from: pathname })} />
        ))}

        <div style={{ display: "grid", placeItems: "center" }}>
          <button
            onClick={() => router.push("/capture")}
            aria-label="New capture"
            className="glow"
            style={{
              marginTop: -26,
              width: 54,
              height: 54,
              background: "var(--acc)",
              color: "#050505",
              display: "grid",
              placeItems: "center",
              position: "relative",
              border: "1px solid var(--acc)",
            }}
          >
            <span
              aria-hidden
              style={{ position: "absolute", inset: -5, border: "1px dashed var(--acc-line)" }}
            />
            <RecIcon size={22} />
          </button>
        </div>

        {right.map((t) => (
          <TabLink key={t.href} tab={t} active={t.match(active)} onTap={() => setPending({ href: t.href, from: pathname })} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  tab,
  active,
  onTap,
}: {
  tab: { href: string; label: string; icon: React.ComponentType<{ size?: number }> };
  active: boolean;
  onTap?: () => void;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      onPointerDown={onTap}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        color: active ? "var(--acc)" : "#6e6e74",
        transition: "color 0.15s",
      }}
    >
      <Icon size={19} />
      <span
        className="font-data"
        style={{ fontSize: 8.5, letterSpacing: "0.14em" }}
      >
        {tab.label}
      </span>
    </Link>
  );
}
