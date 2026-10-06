import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import NoteScreen from "@/components/NoteScreen";
import { getDoc, linksFrom, backlinks } from "@/lib/queries";
import { requireSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const decoded = slug.map((s) => decodeURIComponent(s));
  const path = `${decoded.join("/")}.md`;

  const space = await requireSpace();
  const doc = await getDoc(space, path);
  if (!doc) notFound();

  const [outbound, back] = await Promise.all([linksFrom(space, path), backlinks(space, path)]);
  const linkMap: Record<string, string | null> = {};
  for (const l of outbound) linkMap[l.target_raw] = l.target_path;

  return (
    <AppShell>
      <NoteScreen
        doc={{
          path: doc.path,
          title: doc.title,
          folder: doc.folder,
          content: doc.content,
          favorite: doc.is_favorite,
          tags: doc.tags,
          updated: doc.updated_at,
          wordCount: doc.word_count,
        }}
        linkMap={linkMap}
        backlinks={back}
      />
    </AppShell>
  );
}
