import Link from "next/link";
import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import { ChevronIcon, StarIcon } from "@/components/Icons";
import { listTopics, listArticles, learnStats, type ArticleCard, type ArticleLevel } from "@/lib/learn";
import { requireSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

const LEVEL_META: Record<ArticleLevel, { label: string; color: string }> = {
  foundation: { label: "FOUNDATION", color: "#8b8b90" },
  "next-step": { label: "NEXT-STEP", color: "#ff6200" },
  stretch: { label: "STRETCH", color: "#ffb27a" },
};

export default async function LearnPage() {
  const space = await requireSpace();
  const [topics, articles, stats] = await Promise.all([listTopics(space), listArticles(space), learnStats(space)]);
  const byTopic = new Map(topics.map((t) => [t.slug, t.title]));

  return (
    <AppShell>
      <SysHeader sub="LEARNING SPACE" />

      {/* Masthead */}
      <section className="panel ticks rise" style={{ padding: "16px 14px", marginBottom: 14 }}>
        <div className="label" style={{ color: "var(--acc)" }}>CURATED FOR A DENSE MIND</div>
        <h1 className="display-xl" style={{ fontSize: 30, margin: "8px 0 6px" }}>
          LEARNING SPACE
        </h1>
        <p style={{ fontSize: 12, color: "var(--color-dim)", lineHeight: 1.6, maxWidth: "42ch" }}>
          Dense over deep, dense over broad. Every read here is aimed one step past what you already know — never noise, never a waste.
        </p>
        <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
          <Stat n={stats.unread} label="UNREAD" />
          <Stat n={stats.articles} label="ARTICLES" />
          <Stat n={stats.topics} label="TOPICS" />
          <Stat n={stats.minutes} label="MIN QUEUED" />
        </div>
      </section>

      {/* Unread queue */}
      <div className="seclabel" style={{ marginBottom: 8 }}>
        QUEUE <em>{"// "}FRESH READS</em>
      </div>
      <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {articles.filter((a) => !a.read_at).map((a) => (
          <ArticleCardView key={a.slug} a={a} topicTitle={byTopic.get(a.topic_slug) ?? a.topic_slug} />
        ))}
        {articles.filter((a) => !a.read_at).length === 0 && (
          <div className="panel" style={{ padding: 16, color: "var(--color-faint)", fontSize: 12 }}>
            All caught up. Ask Claude to curate more from your journal.
          </div>
        )}
      </div>

      {/* Read */}
      {articles.some((a) => a.read_at) && (
        <>
          <div className="seclabel" style={{ marginBottom: 8 }}>
            ARCHIVE <em>{"// "}READ</em>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {articles.filter((a) => a.read_at).map((a) => (
              <ArticleCardView key={a.slug} a={a} topicTitle={byTopic.get(a.topic_slug) ?? a.topic_slug} read />
            ))}
          </div>
        </>
      )}

      {/* Topics roadmap */}
      <div className="seclabel" style={{ marginBottom: 8 }}>
        TOPICS <em>{"// "}ROADMAP</em>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {topics.map((t) => {
          const count = articles.filter((a) => a.topic_slug === t.slug).length;
          const planned = t.status === "planned";
          return (
            <div
              key={t.slug}
              className="panel"
              style={{ padding: "11px 12px", borderLeft: planned ? "1px dashed var(--color-line-2)" : "2px solid var(--acc)", opacity: planned ? 0.7 : 1 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="font-display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", flex: 1 }}>
                  {t.title}
                </span>
                <span className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: planned ? "var(--color-faint)" : "var(--acc)" }}>
                  {planned ? "PLANNED" : `${count} READ${count === 1 ? "" : "S"}`}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--color-dim)", marginTop: 3, lineHeight: 1.5 }}>{t.blurb}</p>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="display-xl tabnum" style={{ fontSize: 28 }}>
        {n}
      </div>
      <div className="label" style={{ fontSize: 8 }}>{label}</div>
    </div>
  );
}

function ArticleCardView({ a, topicTitle, read }: { a: ArticleCard; topicTitle: string; read?: boolean }) {
  const lvl = LEVEL_META[a.level];
  return (
    <Link href={`/learn/${a.slug}`} className="panel ticks" style={{ display: "block", padding: "13px 14px", opacity: read ? 0.72 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span className="font-data" style={{ fontSize: 8, letterSpacing: "0.14em", color: lvl.color, border: `1px solid ${lvl.color}55`, padding: "2px 6px" }}>
          {lvl.label}
        </span>
        <span className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--color-faint)", flex: 1, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {topicTitle}
        </span>
        <span className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)" }}>{a.est_min} MIN</span>
        {a.is_favorite && <StarIcon size={11} filled className="text-[var(--color-acc)]" />}
      </div>
      <div className="font-display" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "0.01em", lineHeight: 1.05, textTransform: "uppercase" }}>
        {a.title}
      </div>
      <p style={{ fontSize: 12, color: "var(--color-dim)", marginTop: 6, lineHeight: 1.55 }}>{a.hook}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, color: "var(--acc)" }}>
        <span className="font-data" style={{ fontSize: 9, letterSpacing: "0.16em" }}>{read ? "RE-READ" : "READ"}</span>
        <ChevronIcon size={13} />
      </div>
    </Link>
  );
}
