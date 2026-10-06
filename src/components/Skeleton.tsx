import AppShell from "./AppShell";
import SysHeader from "./SysHeader";

/**
 * Instant-paint placeholders. Next streams these the moment a tab is tapped, so
 * the shell + chrome appear immediately instead of waiting on the server round-trip.
 * Deliberately cheap: a single shared pulse animation on opacity (compositor-only,
 * no layout), no per-element timers.
 */

export function Bar({ w = "100%", h = 12, mt = 0 }: { w?: string | number; h?: number; mt?: number }) {
  return <div className="sk" style={{ width: w, height: h, marginTop: mt }} aria-hidden />;
}

/** Full screen placeholder with the real header already painted. */
export function ScreenSkeleton({ sub, children }: { sub: string; children: React.ReactNode }) {
  return (
    <AppShell>
      <SysHeader sub={sub} />
      <div className="sk-wrap">{children}</div>
    </AppShell>
  );
}

export function RowsSkeleton({ n = 4, h = 52 }: { n?: number; h?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="sk" style={{ height: h }} aria-hidden />
      ))}
    </div>
  );
}

export function SectionLabel() {
  return <Bar w={140} h={9} />;
}
