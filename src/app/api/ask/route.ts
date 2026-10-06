import { NextRequest } from "next/server";
import { runAsk, ChatTurn } from "@/lib/ask";
import { currentSpace } from "@/lib/space";

export const maxDuration = 60; // Vercel Hobby cap; heavy ingestion is better run via the offline Claude path

/**
 * POST /api/ask { question, history? } — Server-Sent Events stream.
 * Events: {type:'tool',tool,detail} · {type:'answer',text} · {type:'sources',paths} ·
 * {type:'error',text} · {type:'done'}
 */
export async function POST(req: NextRequest) {
  const space = await currentSpace();
  if (!space) return new Response(JSON.stringify({ error: "Locked" }), { status: 401 });

  const { question, history = [] } = (await req.json()) as { question?: string; history?: ChatTurn[] };
  if (!question?.trim()) {
    return new Response(JSON.stringify({ error: "question required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        await runAsk(space, question.trim(), history, send);
      } catch (err) {
        send({ type: "error", text: err instanceof Error ? err.message : "Ask failed" });
        send({ type: "done" });
      } finally {
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
