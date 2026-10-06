import { listCaptures } from "@/lib/queries";
import { requireSpace } from "@/lib/space";
import CaptureScreen from "@/components/CaptureScreen";

export const dynamic = "force-dynamic";

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const space = await requireSpace();
  const captures = await listCaptures(space);
  return (
    <CaptureScreen
      initialTab={tab === "drafts" ? "drafts" : "capture"}
      captures={captures.map((c) => ({
        id: c.id,
        entry_date: c.entry_date,
        source: c.source,
        raw_text: c.raw_text,
        duration_sec: c.duration_sec,
        status: c.status,
        captured_at: c.captured_at,
        files_touched: c.files_touched,
        error: c.error,
      }))}
    />
  );
}
