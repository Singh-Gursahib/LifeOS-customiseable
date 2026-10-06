import Link from "next/link";
import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";

export default function NotFound() {
  return (
    <AppShell>
      <SysHeader sub="404" />
      <div className="panel ticks" style={{ padding: 24, textAlign: "center", marginTop: 40 }}>
        <div className="display-xl" style={{ fontSize: 56, color: "var(--acc)" }}>404</div>
        <p style={{ color: "var(--color-dim)", fontSize: 12.5, margin: "10px 0 18px" }}>
          No signal at this path. The note may not exist yet.
        </p>
        <Link href="/" className="font-display" style={{ display: "inline-block", background: "var(--acc)", color: "#050505", padding: "9px 16px", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13 }}>
          RETURN TO BASE
        </Link>
      </div>
    </AppShell>
  );
}
