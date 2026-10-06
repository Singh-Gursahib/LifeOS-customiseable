import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";

export default function Placeholder({ tab, phase, blurb }: { tab: string; phase: string; blurb: string }) {
  return (
    <AppShell>
      <SysHeader sub={tab.toUpperCase()} />
      <div className="panel ticks" style={{ padding: 22, marginTop: 24 }}>
        <div className="font-data" style={{ fontSize: 9, letterSpacing: "0.22em", color: "var(--acc)" }}>
          {phase}
        </div>
        <div className="display-xl" style={{ fontSize: 34, marginTop: 8 }}>
          {tab}
        </div>
        <p style={{ color: "var(--color-dim)", fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{blurb}</p>
        <div className="hazard" style={{ height: 8, marginTop: 16, opacity: 0.8 }} />
      </div>
    </AppShell>
  );
}
