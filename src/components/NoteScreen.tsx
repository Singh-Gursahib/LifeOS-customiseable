"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NoteView from "./NoteView";
import { BackIcon, StarIcon, CheckIcon } from "./Icons";
import { saveNoteAction, toggleFavoriteAction, touchAction } from "@/app/vault/[...slug]/actions";

interface DocData {
  path: string;
  title: string;
  folder: string;
  content: string;
  favorite: boolean;
  tags: string[];
  updated: string;
  wordCount: number;
}

export default function NoteScreen({
  doc,
  linkMap,
  backlinks,
}: {
  doc: DocData;
  linkMap: Record<string, string | null>;
  backlinks: { source_path: string; title: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.content);
  const [favorite, setFavorite] = useState(doc.favorite);
  const [pending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  // record access once on open
  useEffect(() => {
    touchAction(doc.path).catch(() => {});
  }, [doc.path]);

  const body = stripFrontmatter(editing ? draft : doc.content);

  const save = () => {
    startTransition(async () => {
      await saveNoteAction(doc.path, draft);
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      router.refresh();
    });
  };

  const toggleFav = () => {
    setFavorite((f) => !f);
    startTransition(() => {
      void toggleFavoriteAction(doc.path);
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={() => router.back()} aria-label="Back" className="panel" style={{ padding: 7 }}>
          <BackIcon size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--color-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {doc.path}
          </div>
        </div>
        <button onClick={toggleFav} aria-label={favorite ? "Unpin" : "Pin"} className="panel" style={{ padding: 7 }}>
          <StarIcon size={16} filled={favorite} className={favorite ? "text-[var(--color-acc)]" : "text-[var(--color-faint)]"} />
        </button>
        {editing ? (
          <button
            onClick={save}
            disabled={pending}
            className="font-display glow"
            style={{ background: "var(--acc)", color: "#050505", padding: "8px 14px", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13 }}
          >
            {pending ? "SAVING…" : "SAVE"}
          </button>
        ) : (
          <button
            onClick={() => {
              setDraft(doc.content);
              setEditing(true);
            }}
            className="font-display panel"
            style={{ padding: "8px 14px", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13, color: "var(--acc)", borderColor: "var(--acc-line)" }}
          >
            EDIT
          </button>
        )}
      </div>

      {savedFlash && (
        <div className="font-data" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, letterSpacing: "0.14em", color: "var(--acc)", marginBottom: 10 }}>
          <CheckIcon size={13} /> SAVED · LINKS REBUILT
        </div>
      )}

      {/* Meta bar */}
      <div className="font-data" style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-faint)", marginBottom: 14 }}>
        <span>{doc.wordCount} WORDS</span>
        <span>UPDATED {doc.updated.slice(0, 10)}</span>
        {doc.tags.length > 0 && <span style={{ color: "var(--acc)" }}>#{doc.tags.slice(0, 4).join(" #")}</span>}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="font-body"
          style={{
            width: "100%",
            minHeight: "58vh",
            background: "var(--color-panel-2)",
            border: "1px solid var(--acc-line)",
            padding: 12,
            fontSize: 12.5,
            lineHeight: 1.65,
            color: "var(--color-fg)",
            outline: "none",
            resize: "vertical",
          }}
        />
      ) : (
        <NoteView body={body} linkMap={linkMap} />
      )}

      {/* Backlinks */}
      {!editing && backlinks.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div className="seclabel" style={{ marginBottom: 8 }}>
            BACKLINKS <em>{"// "}{String(backlinks.length).padStart(2, "0")}</em>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {backlinks.map((b) => (
              <Link
                key={b.source_path}
                href={`/vault/${b.source_path.replace(/\.md$/, "")}`}
                className="panel"
                style={{ padding: "8px 11px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ color: "var(--color-fg)" }}>{b.title}</span>
                <span className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)" }}>
                  {b.source_path.replace(/\.md$/, "")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
