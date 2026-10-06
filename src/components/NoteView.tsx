"use client";

import { useMemo, isValidElement, cloneElement, ReactNode, ReactElement } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  body: string;
  linkMap: Record<string, string | null>; // raw wiki target -> resolved path (or null if broken)
}

/**
 * Renders markdown, converting [[wiki|links]] into placeholder tokens first,
 * then into clickable spans. Falls back gracefully for broken links.
 */
export default function NoteView({ body, linkMap }: Props) {
  const router = useRouter();

  const { transformed, tokens } = useMemo(() => {
    const tokens: { display: string; target: string; resolved: string | null }[] = [];
    const WIKI = /\[\[([^\]\n#|^]+)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g;
    const transformed = body.replace(WIKI, (_m, target: string, display?: string) => {
      const idx = tokens.length;
      tokens.push({ display: (display ?? target).trim(), target: target.trim(), resolved: linkMap[target.trim()] ?? null });
      return `%%WL${idx}%%`;
    });
    return { transformed, tokens };
  }, [body, linkMap]);

  const renderWithLinks = (text: string): React.ReactNode[] => {
    const parts = text.split(/(%%WL\d+%%)/g);
    return parts.map((part, i) => {
      const m = part.match(/^%%WL(\d+)%%$/);
      if (!m) return <span key={i}>{part}</span>;
      const tok = tokens[Number(m[1])];
      if (!tok) return <span key={i}>{part}</span>;
      const broken = !tok.resolved;
      return (
        <span
          key={i}
          className={`wikilink${broken ? " broken" : ""}`}
          role={broken ? undefined : "link"}
          tabIndex={broken ? undefined : 0}
          title={broken ? `No note yet for "${tok.target}"` : tok.resolved!}
          onClick={() => tok.resolved && router.push(`/vault/${tok.resolved.replace(/\.md$/, "")}`)}
          onKeyDown={(e) => {
            if (!broken && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              router.push(`/vault/${tok.resolved!.replace(/\.md$/, "")}`);
            }
          }}
        >
          {tok.display}
        </span>
      );
    });
  };

  // Recursively replace %%WLn%% tokens in every string leaf, including those
  // nested inside <strong>, <em>, <a>, <li>, etc.
  const kids = (children: ReactNode): ReactNode => {
    if (typeof children === "string") return renderWithLinks(children);
    if (Array.isArray(children)) return children.map((c, i) => <span key={i}>{kids(c)}</span>);
    if (isValidElement(children)) {
      const el = children as ReactElement<{ children?: ReactNode }>;
      if (el.props?.children != null) return cloneElement(el, undefined, kids(el.props.children));
    }
    return children;
  };

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{kids(children)}</p>,
          li: ({ children }) => <li>{kids(children)}</li>,
          td: ({ children }) => <td>{kids(children)}</td>,
          th: ({ children }) => <th>{kids(children)}</th>,
          h1: ({ children }) => <h1>{kids(children)}</h1>,
          h2: ({ children }) => <h2>{kids(children)}</h2>,
          h3: ({ children }) => <h3>{kids(children)}</h3>,
          blockquote: ({ children }) => <blockquote>{kids(children)}</blockquote>,
        }}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
}
