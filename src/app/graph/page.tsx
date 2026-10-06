import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import GraphScreen from "@/components/GraphScreen";
import { listDocs, allLinks } from "@/lib/queries";
import { requireSpace } from "@/lib/space";
import { isoMinusDays, todayParts } from "@/lib/vault";

export const dynamic = "force-dynamic";

/** A note is a daily log if it lives under journal/ (journal/YYYY/YYYY-MM-DD.md). */
function isDailyLog(path: string, folder: string): boolean {
  return folder === "journal" || folder.startsWith("journal/") || /(^|\/)\d{4}-\d{2}-\d{2}\.md$/.test(path);
}

const MAX_BRIDGE_PER_DAY = 5; // a day linking N topics yields N*(N-1)/2 edges — cap the fan-out

export default async function GraphPage() {
  const space = await requireSpace();
  const [docs, links] = await Promise.all([listDocs(space), allLinks(space)]);

  // Nodes = real notes, excluding folder indexes AND daily logs. Daily logs would
  // add one dated node per day and swamp the map; instead we contract them below.
  const realNotes = docs.filter((d) => !d.path.endsWith("_index.md"));
  const topicNotes = realNotes.filter((d) => !isDailyLog(d.path, d.folder));
  const topicPaths = new Set(topicNotes.map((d) => d.path));
  const logPaths = new Set(realNotes.filter((d) => isDailyLog(d.path, d.folder)).map((d) => d.path));

  const { iso: today } = todayParts();
  const hotSince = isoMinusDays(today, 7);

  const nodes = topicNotes.map((d) => ({
    path: d.path,
    title: d.title,
    folder: d.folder.split("/")[0] || "root",
    hot: d.updated_at.slice(0, 10) >= hotSince,
    fav: d.is_favorite,
  }));

  const edgeMap = new Map<string, { a: string; b: string; soft: boolean }>();
  const addEdge = (a: string, b: string, soft: boolean) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const existing = edgeMap.get(key);
    if (!existing) edgeMap.set(key, { a, b, soft });
    else if (!soft) existing.soft = false; // a real link outranks a bridged one
  };

  // 1. direct links between topic notes
  for (const l of links) {
    if (l.target_path && topicPaths.has(l.source_path) && topicPaths.has(l.target_path)) {
      addEdge(l.source_path, l.target_path, false);
    }
  }

  // 2. contract each daily log: the topics it connected become linked to each other.
  // "Maya and the algorithms course came up on the same day" is real signal — keep the
  // relationship, drop the node. Repeat co-occurrences collapse onto one edge.
  const byLog = new Map<string, Set<string>>();
  const touch = (log: string, topic: string) => {
    if (!byLog.has(log)) byLog.set(log, new Set());
    byLog.get(log)!.add(topic);
  };
  for (const l of links) {
    if (!l.target_path) continue;
    if (logPaths.has(l.source_path) && topicPaths.has(l.target_path)) touch(l.source_path, l.target_path);
    else if (logPaths.has(l.target_path) && topicPaths.has(l.source_path)) touch(l.target_path, l.source_path);
  }
  for (const topics of byLog.values()) {
    const list = [...topics].slice(0, MAX_BRIDGE_PER_DAY);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) addEdge(list[i], list[j], true);
    }
  }

  return (
    <AppShell>
      <SysHeader sub="VAULT MAP" />
      <GraphScreen nodes={nodes} edges={[...edgeMap.values()]} logCount={logPaths.size} />
    </AppShell>
  );
}
