import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, audioFormatFor, humanizeLlmError, TRANSCRIBE_MODEL } from "@/lib/llm";
import { transcribeAudio as transcribeViaGemini } from "@/lib/gemini";

export const maxDuration = 60; // Vercel Hobby cap; heavy ingestion is better run via the offline Claude path

/**
 * POST /api/transcribe — multipart form with an `audio` file.
 * Returns { text } — the English transcript, ready for the editor.
 * Audio is never stored; it exists only for the duration of this request.
 *
 * Primary: Gemini 3.7 Flash via OpenRouter (fast, reliable). Falls back to the
 * direct Gemini API if OpenRouter is unreachable, so capture never hard-fails.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file in form field 'audio'." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
    }
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio larger than 200MB — trim the recording first." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "";
    const format = audioFormatFor(mime, file.name);
    const started = Date.now();

    let text: string;
    let via = TRANSCRIBE_MODEL;
    try {
      text = await transcribeAudio(bytes, format);
    } catch (primaryErr) {
      // The direct-Gemini fallback is optional. Without GEMINI_API_KEYS, surface the
      // real OpenRouter error instead of a misleading "missing Gemini key" one.
      if (!process.env.GEMINI_API_KEYS) throw primaryErr;
      console.warn("[transcribe] OpenRouter failed, falling back to direct Gemini:", primaryErr instanceof Error ? primaryErr.message : primaryErr);
      text = await transcribeViaGemini(bytes, mime || `audio/${format}`);
      via = "gemini-direct";
    }

    return NextResponse.json({
      text,
      meta: { bytes: file.size, mime, format, via, ms: Date.now() - started },
    });
  } catch (err) {
    const msg = humanizeLlmError(err);
    console.error("[transcribe]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
