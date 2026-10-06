import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the secret (service role) key.
 * All data access flows through the Next.js server — the browser never
 * talks to Supabase directly, so RLS stays deny-all.
 */
let client: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseServer() must only be called on the server");
  }
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface DocumentRow {
  id: string;
  path: string;
  folder: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  is_favorite: boolean;
  word_count: number;
  accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkRow {
  id: number;
  source_path: string;
  target_raw: string;
  target_path: string | null;
}

export interface CaptureRow {
  id: string;
  captured_at: string;
  entry_date: string;
  source: "voice" | "text" | "upload";
  raw_text: string;
  duration_sec: number | null;
  status: "draft" | "ingesting" | "ingested" | "failed";
  ingested_at: string | null;
  ingested_by: string | null;
  ingestion_log: unknown[];
  files_touched: string[];
  error: string | null;
}
