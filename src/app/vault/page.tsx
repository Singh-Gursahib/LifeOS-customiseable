import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import VaultBrowser from "@/components/VaultBrowser";
import { listDocs } from "@/lib/queries";
import { requireSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const space = await requireSpace();
  const docs = await listDocs(space);
  const slim = docs.map((d) => ({
    path: d.path,
    title: d.title,
    folder: d.folder,
    favorite: d.is_favorite,
    updated: d.updated_at,
    summary: typeof (d.frontmatter as Record<string, unknown>)?.summary === "string" ? ((d.frontmatter as Record<string, unknown>).summary as string) : "",
  }));

  return (
    <AppShell>
      <SysHeader sub="VAULT INDEX" />
      <VaultBrowser docs={slim} />
    </AppShell>
  );
}
