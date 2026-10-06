"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BackIcon, StarIcon, CheckIcon } from "./Icons";
import { markReadAction, toggleArticleFavoriteAction } from "@/app/learn/actions";
import type { LearningArticle, ArticleLevel } from "@/lib/learn";

const LEVEL_META: Record<ArticleLevel, { label: string; color: string }> = {
  foundation: { label: "FOUNDATION", color: "#8b8b90" },
  "next-step": { label: "NEXT-STEP", color: "#ff6200" },
  stretch: { label: "STRETCH", color: "#ffb27a" },
};

export default function ArticleScreen({ article, topicTitle }: { article: LearningArticle; topicTitle: string }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(article.is_favorite);
  const [read, setRead] = useState(!!article.read_at);
  const [, startTransition] = useTransition();
  const markedRef = useRef(false);
  const lvl = LEVEL_META[article.level];

  // auto mark-read once the reader has spent a few seconds on the page
  useEffect(() => {
    if (read || markedRef.current) return;
    const t = setTimeout(() => {
      markedRef.current = true;
      setRead(true);
      markReadAction(article.slug).catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, [read, article.slug]);

  const toggleFav = () => {
    setFavorite((f) => !f);
    startTransition(() => {
      void toggleArticleFavoriteAction(article.slug);
    });
  };

  return (
    <article>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => router.push("/learn")} aria-label="Back to Learning Space" className="panel" style={{ padding: 7 }}>
          <BackIcon size={18} />
        </button>
        <span className="label" style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {topicTitle}
        </span>
        {read && (
          <span className="font-data" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, letterSpacing: "0.14em", color: "var(--acc)" }}>
            <CheckIcon size={12} /> READ
          </span>
        )}
        <button onClick={toggleFav} aria-label={favorite ? "Unpin" : "Pin"} className="panel" style={{ padding: 7 }}>
          <StarIcon size={16} filled={favorite} className={favorite ? "text-[var(--color-acc)]" : "text-[var(--color-faint)]"} />
        </button>
      </div>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.16em", color: lvl.color, border: `1px solid ${lvl.color}55`, padding: "3px 7px" }}>
          {lvl.label}
        </span>
        <span className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)", letterSpacing: "0.1em" }}>{article.est_min} MIN READ</span>
      </div>
      <h1 className="display-xl" style={{ fontSize: "clamp(28px,8vw,38px)", marginBottom: 10, textWrap: "balance" }}>
        {article.title}
      </h1>

      {/* why now */}
      {article.why_now && (
        <div style={{ borderLeft: "2px solid var(--acc)", background: "var(--acc-soft)", padding: "11px 13px", marginBottom: 18 }}>
          <div className="label" style={{ color: "var(--acc)", marginBottom: 4 }}>WHY THIS, WHY NOW</div>
          <p style={{ fontSize: 12.5, color: "var(--color-fg)", lineHeight: 1.55 }}>{article.why_now}</p>
        </div>
      )}

      {/* body */}
      <div className="prose article-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripWikiLinks(article.content)}</ReactMarkdown>
      </div>

      {/* footer */}
      <div style={{ marginTop: 26, paddingTop: 14, borderTop: "1px solid var(--color-line)", display: "flex", gap: 8 }}>
        {!read && (
          <button
            onClick={() => {
              setRead(true);
              markedRef.current = true;
              startTransition(() => void markReadAction(article.slug));
            }}
            className="font-display"
            style={{ flex: 1, border: "1px solid var(--acc-line)", color: "var(--acc)", padding: "12px 0", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13 }}
          >
            MARK READ
          </button>
        )}
        <button
          onClick={() => router.push("/learn")}
          className={read ? "font-display glow" : "font-display panel"}
          style={{ flex: 1, background: read ? "var(--acc)" : undefined, color: read ? "#050505" : "var(--color-dim)", padding: "12px 0", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13 }}
        >
          {read ? "NEXT READ ▸" : "BACK TO QUEUE"}
        </button>
      </div>

      {article.tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 14 }}>
          {article.tags.map((t) => (
            <span key={t} className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.08em", color: "var(--color-faint)", border: "1px solid var(--color-line)", padding: "2px 7px" }}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

// Articles may reference vault notes via [[wiki|link]] — render just the label as bold, not a link.
function stripWikiLinks(md: string): string {
  return md.replace(/\[\[([^\]\n#|^]+)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g, (_m, target: string, display?: string) => `**${(display ?? target).trim()}**`);
}
