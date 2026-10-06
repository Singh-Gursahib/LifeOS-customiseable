import "server-only";
import { supabaseServer } from "./supabase";
import { SpaceId } from "./session";

export type ArticleLevel = "foundation" | "next-step" | "stretch";
export type TopicStatus = "active" | "planned" | "archived";

export interface LearningTopic {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  status: TopicStatus;
  sort: number;
  created_at: string;
}

export interface LearningArticle {
  id: string;
  slug: string;
  topic_slug: string;
  title: string;
  hook: string;
  content: string;
  level: ArticleLevel;
  est_min: number;
  tags: string[];
  why_now: string;
  status: "published" | "draft";
  is_favorite: boolean;
  read_at: string | null;
  created_at: string;
}

export type ArticleCard = Omit<LearningArticle, "content">;

const CARD_COLS = "id,slug,topic_slug,title,hook,level,est_min,tags,why_now,status,is_favorite,read_at,created_at";

export async function listTopics(space: SpaceId): Promise<LearningTopic[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("learning_topics").select("*").eq("space", space).order("sort").order("created_at");
  return (data as LearningTopic[]) ?? [];
}

export async function listArticles(space: SpaceId, topicSlug?: string): Promise<ArticleCard[]> {
  const sb = supabaseServer();
  let q = sb.from("learning_articles").select(CARD_COLS).eq("space", space).eq("status", "published").order("created_at", { ascending: false });
  if (topicSlug) q = q.eq("topic_slug", topicSlug);
  const { data } = await q;
  return (data as ArticleCard[]) ?? [];
}

export async function getArticle(space: SpaceId, slug: string): Promise<LearningArticle | null> {
  const sb = supabaseServer();
  const { data } = await sb.from("learning_articles").select("*").eq("space", space).eq("slug", slug).maybeSingle();
  return (data as LearningArticle) ?? null;
}

export interface LearnStats {
  articles: number;
  unread: number;
  topics: number;
  minutes: number; // total est reading minutes of unread
}

export async function learnStats(space: SpaceId): Promise<LearnStats> {
  const sb = supabaseServer();
  const [{ data: arts }, { count: topics }] = await Promise.all([
    sb.from("learning_articles").select("est_min,read_at").eq("space", space).eq("status", "published"),
    sb.from("learning_topics").select("*", { count: "exact", head: true }).eq("space", space),
  ]);
  const rows = (arts as { est_min: number; read_at: string | null }[]) ?? [];
  const unread = rows.filter((r) => !r.read_at);
  return {
    articles: rows.length,
    unread: unread.length,
    topics: topics ?? 0,
    minutes: unread.reduce((s, r) => s + (r.est_min || 0), 0),
  };
}

export async function markRead(space: SpaceId, slug: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("learning_articles").update({ read_at: new Date().toISOString() }).eq("space", space).eq("slug", slug).is("read_at", null);
}

export async function toggleArticleFavorite(space: SpaceId, slug: string): Promise<boolean> {
  const sb = supabaseServer();
  const { data } = await sb.from("learning_articles").select("is_favorite").eq("space", space).eq("slug", slug).maybeSingle();
  const next = !(data as { is_favorite: boolean } | null)?.is_favorite;
  await sb.from("learning_articles").update({ is_favorite: next }).eq("space", space).eq("slug", slug);
  return next;
}
