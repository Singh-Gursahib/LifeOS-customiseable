import Link from "next/link";
import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import EntryRow from "@/components/EntryRow";
import { RecIcon, ChevronIcon, StarIcon } from "@/components/Icons";
import { recentDocs, favoriteDocs, vaultStats, linkCounts } from "@/lib/queries";
import { requireSpace } from "@/lib/space";
import { todayParts } from "@/lib/vault";

// Rendered per request: the page depends on which space the session unlocked, so
// it must never be served from a shared cache. loading.tsx keeps it feeling instant.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const space = await requireSpace();
  const [stats, recent, favorites] = await Promise.all([vaultStats(space), recentDocs(space, 4), favoriteDocs(space, 4)]);
  const { dayOfYear, label } = todayParts();
  const linkCount = await linkCounts(space, recent.map((d) => d.path));

  return (
    <AppShell>
      <SysHeader />

      {/* Masthead: day counter + gauges */}
      <section className="panel ticks rise" style={{ padding: "14px 14px 12px", marginBottom: 12 }}>
        <div className="label">{label} — DAY OF YEAR</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginTop: 6 }}>
          <div>
            <div className="display-xl tabnum" style={{ fontSize: 72 }}>
              {dayOfYear}
            </div>
            <div className="font-data" style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "var(--acc)", marginTop: 8 }}>
              ▲ STREAK {stats.streak} {stats.streak === 1 ? "DAY" : "DAYS"}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, paddingBottom: 2 }}>
            <Gauge label="ENTRIES" value={stats.totalEntries} max={Math.max(stats.totalEntries, 30)} />
            <Gauge label="VAULT FILES" value={stats.totalDocs} max={Math.max(stats.totalDocs, 100)} />
            <Gauge label="INGEST QUEUE" value={stats.draftCount} max={10} />
          </div>
        </div>
      </section>

      {/* REC module */}
      <Link href="/capture" className="rise" style={{ display: "block", border: "1px solid var(--acc-line)", padding: 3, marginBottom: 14 }}>
        <div
          className="hazard-soft"
          style={{
            border: "1px solid rgba(255,98,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
          }}
        >
          <span style={{ width: 34, height: 34, background: "var(--acc)", display: "grid", placeItems: "center", flex: "none", color: "#050505" }}>
            <RecIcon size={18} />
          </span>
          <span style={{ flex: 1 }}>
            <span className="font-display" style={{ display: "block", fontWeight: 700, fontSize: 17, letterSpacing: "0.12em" }}>
              REC — NEW CAPTURE
            </span>
            <span className="font-data" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--color-dim)" }}>
              VOICE · TEXT · AUDIO FILE → GEMINI
            </span>
          </span>
          <ChevronIcon size={16} className="text-[var(--color-acc)]" />
        </div>
      </Link>

      {/* Recent entries */}
      <div className="seclabel" style={{ marginBottom: 8 }}>
        RECENT <em>{"// "}LATEST TOUCHED</em>
      </div>
      <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {recent.map((doc, i) => (
          <EntryRow key={doc.path} doc={doc} code={`JX.${String(stats.totalDocs - i).padStart(3, "0")}`} links={linkCount.get(doc.path) ?? 0} />
        ))}
      </div>

      {/* Drafts alert strip */}
      {stats.draftCount > 0 && (
        <Link
          href="/capture?tab=drafts"
          className="rise"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--acc)",
            color: "#050505",
            padding: "10px 12px",
            marginBottom: 14,
          }}
        >
          <span className="font-display" style={{ fontWeight: 700, letterSpacing: "0.1em", fontSize: 13.5, flex: 1 }}>
            CAPTURES AWAITING INGESTION
          </span>
          <span className="font-data tabnum" style={{ background: "#050505", color: "var(--acc)", padding: "2px 7px", fontSize: 11 }}>
            {String(stats.draftCount).padStart(2, "0")}
          </span>
          <span className="font-data" style={{ fontSize: 9, letterSpacing: "0.2em", border: "1px solid rgba(0,0,0,0.55)", padding: "4px 8px" }}>
            RUN ▸
          </span>
        </Link>
      )}

      {/* Pinned favorites */}
      <div className="seclabel" style={{ marginBottom: 8 }}>
        PINNED <em>{"// "}FAVORITES</em>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {favorites.map((doc) => (
          <Link
            key={doc.path}
            href={`/vault/${doc.path.replace(/\.md$/, "")}`}
            className="panel font-data"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", fontSize: 10, letterSpacing: "0.06em", color: "var(--color-dim)" }}
          >
            <StarIcon size={11} filled className="text-[var(--color-acc)]" />
            {doc.path.replace(/\/_index\.md$/, "/").replace(/\.md$/, "")}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

function Gauge({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="font-data" style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--color-dim)" }}>
          {label}
        </span>
        <span className="font-data tabnum" style={{ fontSize: 9.5, color: "var(--color-fg)" }}>
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <div className="gauge" style={{ marginTop: 3 }}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
