"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { requireSpace } from "@/lib/space";
import { todayParts } from "@/lib/vault";

export interface NewCapture {
  raw_text: string;
  source: "voice" | "text" | "upload";
  duration_sec?: number | null;
  entry_date?: string; // ISO date; defaults to today (Vancouver)
}

export type CaptureResult = { ok: true; id: string } | { ok: false; error: string };

// Returns a result object rather than throwing: thrown Server Action errors are
// redacted to a generic message in production, so we surface real errors this way.
export async function createCaptureAction(input: NewCapture): Promise<CaptureResult> {
  const text = input.raw_text.trim();
  if (!text) return { ok: false, error: "Nothing to save — the text is empty." };
  try {
    const space = await requireSpace();
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("captures")
      .insert({
        space,
        raw_text: text,
        source: input.source,
        // duration_sec is an int column; the recorder reports sub-second precision (e.g. 47.9)
        duration_sec: input.duration_sec != null ? Math.round(input.duration_sec) : null,
        entry_date: input.entry_date ?? todayParts().iso,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Couldn't save capture: ${error.message}` };
    revalidatePath("/capture");
    revalidatePath("/");
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unexpected error saving capture." };
  }
}

export async function deleteCaptureAction(id: string): Promise<void> {
  const space = await requireSpace();
  const sb = supabaseServer();
  const { error } = await sb.from("captures").delete().eq("space", space).eq("id", id).eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath("/capture");
  revalidatePath("/");
}

export async function refreshAfterIngest(): Promise<void> {
  revalidatePath("/capture");
  revalidatePath("/");
  revalidatePath("/vault");
}
