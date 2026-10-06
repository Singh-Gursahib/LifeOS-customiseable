import { NextRequest } from "next/server";
import { ingestCapture } from "@/lib/ingest";
import { currentSpace } from "@/lib/space";

export const maxDuration = 60; // Vercel Hobby cap; heavy ingestion is better run via the offline Claude path

/**
 * POST /api/ingest { captureId } — Server-Sent Events stream so the UI can show
 * the filing happening live instead of staring at a spinner.
 * Events: {type:'tool',tool,path,ok} · {type:'done',summary,filesTouched} · {type:'error',text}
 */
export async function POST(req: NextRequest) {
  const space = await currentSpace();
  if (!space) {
    return new Response(JSON.stringify({ error: "Locked" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { captureId } = (await req.json()) as { captureId?: string };
  if (!captureId) {
    return new Response(JSON.stringify({ error: "captureId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const outcome = await ingestCapture(space, captureId, send);
        if (!outcome.ok) send({ type: "error", text: outcome.error ?? "Ingestion failed" });
      } catch (err) {
        send({ type: "error", text: err instanceof Error ? err.message : "Ingestion failed" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
