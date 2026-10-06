import { load as yamlLoad } from "js-yaml";
const yaml = { load: yamlLoad };

/** Parsed markdown file: frontmatter + body + extracted wiki links and tags. */
export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
  wikiLinks: { target: string; display?: string }[];
  tags: string[];
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKI_RE = /\[\[([^\]\n#|^]+)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g;
const TAG_RE = /(?:^|[\s(])#([A-Za-z][\w\-/]*)/g;
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;

export function parseDoc(text: string): ParsedDoc {
  let body = text;
  let frontmatter: Record<string, unknown> = {};
  const m = FM_RE.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    try {
      const parsed = yaml.load(m[1]);
      if (parsed && typeof parsed === "object") frontmatter = parsed as Record<string, unknown>;
    } catch {
      /* tolerate bad yaml */
    }
  }

  const stripped = body.replace(CODE_RE, " ");
  const wikiLinks: { target: string; display?: string }[] = [];
  for (const w of stripped.matchAll(WIKI_RE)) {
    wikiLinks.push({ target: w[1].trim(), display: w[2]?.trim() });
  }

  const tags = new Set<string>();
  for (const t of stripped.matchAll(TAG_RE)) tags.add(t[1].toLowerCase());
  const fmTags = frontmatter.tags ?? frontmatter.tag;
  if (Array.isArray(fmTags)) fmTags.forEach((t) => typeof t === "string" && tags.add(t.replace(/^#/, "").toLowerCase()));
  else if (typeof fmTags === "string") fmTags.split(/[\s,]+/).filter(Boolean).forEach((t) => tags.add(t.replace(/^#/, "").toLowerCase()));

  return { frontmatter, body, wikiLinks, tags: [...tags] };
}

/** 'people/friends/maya.md' -> 'people/friends' ; 'x.md' -> '' */
export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** 'people/friends/maya.md' -> 'maya' */
export function basenameOf(path: string): string {
  const seg = path.split("/").pop() ?? path;
  return seg.replace(/\.md$/i, "");
}

export function isIndexPath(path: string): boolean {
  return basenameOf(path) === "_index";
}

/** Title: frontmatter.title > first H1 > basename */
export function titleOf(path: string, frontmatter: Record<string, unknown>, body: string): string {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) return frontmatter.title.trim();
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return basenameOf(path);
}

export function wordCount(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Build a wiki-link resolver over the set of vault paths.
 * Resolution order: exact path -> folder index ('courses' -> '.../courses/_index.md'
 * when path-qualified) -> unique basename -> folder-name alias to its _index.md.
 */
export function buildResolver(paths: Iterable<string>): (target: string) => string | null {
  const byPath = new Set(paths);
  const byBasename = new Map<string, string>();
  for (const p of byPath) {
    const base = basenameOf(p).toLowerCase();
    if (base !== "_index") byBasename.set(base, p);
  }
  for (const p of byPath) {
    if (!p.endsWith("/_index.md")) continue;
    const folderName = folderOf(p).split("/").pop()?.toLowerCase();
    if (folderName && !byBasename.has(folderName)) byBasename.set(folderName, p);
  }
  return (target: string) => {
    const t = target.trim().replace(/\.md$/i, "");
    if (byPath.has(`${t}.md`)) return `${t}.md`;
    if (byPath.has(`${t}/_index.md`)) return `${t}/_index.md`;
    const base = (t.split("/").pop() ?? t).toLowerCase();
    return byBasename.get(base) ?? null;
  };
}

/** Day-of-year + date labels in the app's home timezone. */
export const APP_TZ = "America/Vancouver";

export function todayParts(now = new Date()) {
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, ...opts }).format(now);
  const iso = fmt({ year: "numeric", month: "2-digit", day: "2-digit" }); // YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 0);
  const cur = Date.UTC(y, m - 1, d);
  const dayOfYear = Math.round((cur - start) / 86_400_000);
  const weekday = fmt({ weekday: "short" }).toUpperCase();
  const label = `${weekday} ${String(d).padStart(2, "0")} ${fmt({ month: "short" }).toUpperCase()} ${y}`;
  return { iso, dayOfYear, year: y, label };
}

/** ISO date string N days before an ISO date (calendar math, tz-safe enough for streaks). */
export function isoMinusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}
