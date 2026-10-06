import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import ArticleScreen from "@/components/ArticleScreen";
import { getArticle, listTopics } from "@/lib/learn";
import { requireSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const space = await requireSpace();
  const article = await getArticle(space, slug);
  if (!article || article.status !== "published") notFound();
  const topics = await listTopics(space);
  const topicTitle = topics.find((t) => t.slug === article.topic_slug)?.title ?? article.topic_slug;

  return (
    <AppShell>
      <ArticleScreen article={article} topicTitle={topicTitle} />
    </AppShell>
  );
}
