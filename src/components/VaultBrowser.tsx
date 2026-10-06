"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon, FolderIcon, FileIcon, StarIcon, ChevronIcon } from "./Icons";

export interface SlimDoc {
  path: string;
  title: string;
  folder: string;
  favorite: boolean;
  updated: string;
  summary: string;
}

interface FolderNode {
  name: string;
  path: string;
  indexDoc?: SlimDoc;
  files: SlimDoc[];
  children: FolderNode[];
}

function buildTree(docs: SlimDoc[]): FolderNode {
  const root: FolderNode = { name: "", path: "", files: [], children: [] };
  const folders = new Map<string, FolderNode>([["", root]]);

  const ensure = (fpath: string): FolderNode => {
    const existing = folders.get(fpath);
    if (existing) return existing;
    const name = fpath.split("/").pop() ?? fpath;
    const node: FolderNode = { name, path: fpath, files: [], children: [] };
    folders.set(fpath, node);
    const parent = ensure(fpath.includes("/") ? fpath.slice(0, fpath.lastIndexOf("/")) : "");
    parent.children.push(node);
    return node;
  };

  for (const d of docs) {
    const node = ensure(d.folder);
    if (d.path.endsWith("_index.md")) node.indexDoc = d;
    else node.files.push(d);
  }
  const sortNode = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.path.localeCompare(b.path));
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

export default function VaultBrowser({ docs }: { docs: SlimDoc[] }) {
  const [q, setQ] = useState("");
  const tree = useMemo(() => buildTree(docs), [docs]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.children.map((c) => c.path)));

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    return docs
      .filter((d) => d.title.toLowerCase().includes(query) || d.path.toLowerCase().includes(query) || d.summary.toLowerCase().includes(query))
      .slice(0, 30);
  }, [q, docs]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const fileCount = docs.filter((d) => !d.path.endsWith("_index.md")).length;

  return (
    <div>
      {/* Search */}
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", marginBottom: 12 }}>
        <SearchIcon size={15} className="text-[var(--color-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, paths, summaries…"
          className="font-body"
          style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--color-fg)" }}
        />
        {q && (
          <button onClick={() => setQ("")} className="font-data" style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--color-faint)" }}>
            CLEAR
          </button>
        )}
      </div>

      <div className="seclabel" style={{ marginBottom: 8 }}>
        {results ? (
          <>
            RESULTS <em>{"// "}{String(results.length).padStart(2, "0")}</em>
          </>
        ) : (
          <>
            TREE <em>{"// "}{fileCount} FILES</em>
          </>
        )}
      </div>

      {results ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {results.length === 0 && (
            <div className="panel" style={{ padding: 14, color: "var(--color-faint)", fontSize: 12 }}>
              No matches in titles or paths. The Ask tab can search inside note content.
            </div>
          )}
          {results.map((d) => (
            <FileRow key={d.path} doc={d} showPath />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tree.files.map((d) => (
            <FileRow key={d.path} doc={d} />
          ))}
          {tree.indexDoc && <FileRow doc={tree.indexDoc} isIndex />}
          {tree.children.map((c) => (
            <Folder key={c.path} node={c} depth={0} open={open} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function Folder({
  node,
  depth,
  open,
  toggle,
}: {
  node: FolderNode;
  depth: number;
  open: Set<string>;
  toggle: (p: string) => void;
}) {
  const isOpen = open.has(node.path);
  const count = countFiles(node);
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 12 }}>
      <div
        className="panel"
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderLeft: isOpen ? "2px solid var(--acc)" : "1px solid var(--color-line)" }}
      >
        <button
          onClick={() => toggle(node.path)}
          aria-expanded={isOpen}
          style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, textAlign: "left" }}
        >
          <ChevronIcon size={12} className="text-[var(--color-faint)]" />
          <span style={{ transform: isOpen ? "none" : "none", display: "none" }} />
          <FolderIcon size={15} className={isOpen ? "text-[var(--color-acc)]" : "text-[var(--color-faint)]"} />
          <span className="font-display" style={{ fontWeight: 500, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {node.name}
          </span>
          <span className="font-data tabnum" style={{ fontSize: 9, color: "var(--color-faint)", marginLeft: "auto" }}>
            {String(count).padStart(2, "0")}
          </span>
        </button>
        {node.indexDoc && (
          <Link href={`/vault/${node.indexDoc.path.replace(/\.md$/, "")}`} className="font-data" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "var(--acc)" }}>
            INDEX ▸
          </Link>
        )}
      </div>
      {isOpen && (
        <div style={{ borderLeft: "1px solid var(--color-line)", marginLeft: 5, paddingLeft: 7, marginTop: 4, display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
          {node.files.map((d) => (
            <FileRow key={d.path} doc={d} />
          ))}
          {node.children.map((c) => (
            <Folder key={c.path} node={c} depth={depth + 1} open={open} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function countFiles(node: FolderNode): number {
  return node.files.length + node.children.reduce((s, c) => s + countFiles(c), 0);
}

function FileRow({ doc, showPath, isIndex }: { doc: SlimDoc; showPath?: boolean; isIndex?: boolean }) {
  return (
    <Link
      href={`/vault/${doc.path.replace(/\.md$/, "")}`}
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", border: "1px solid transparent" }}
      className="hover:!border-[var(--color-line)]"
    >
      <FileIcon size={13} className={isIndex ? "text-[var(--color-acc)]" : "text-[var(--color-faint)]"} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--color-fg)" }}>
          {isIndex ? `${doc.title} (index)` : doc.title}
        </span>
        {showPath && (
          <span className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)" }}>
            {doc.path}
          </span>
        )}
      </span>
      {doc.favorite && <StarIcon size={11} filled className="text-[var(--color-acc)]" />}
    </Link>
  );
}
