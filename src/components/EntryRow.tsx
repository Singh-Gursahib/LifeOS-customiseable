import Link from "next/link";
import { ChevronIcon } from "./Icons";
import { DocMeta } from "@/lib/queries";

/** A dense telemetry-style row: index code · title · path meta · chevron. */
export default function EntryRow({ doc, code, links }: { doc: DocMeta; code: string; links?: number }) {
  return (
    <Link
      href={`/vault/${doc.path.replace(/\.md$/, "")}`}
      className="panel"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px" }}
    >
      <span className="font-data" style={{ fontSize: 8.5, color: "var(--acc)", letterSpacing: "0.06em", width: 46, flex: "none" }}>
        {code}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            color: "var(--color-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {doc.title}
        </span>
        <span className="font-data" style={{ fontSize: 8.5, color: "var(--color-faint)", letterSpacing: "0.04em" }}>
          {doc.folder || "root"}
          {links ? ` · links ${String(links).padStart(2, "0")}` : ""}
        </span>
      </span>
      <ChevronIcon size={14} className="text-[var(--color-faint)]" />
    </Link>
  );
}
