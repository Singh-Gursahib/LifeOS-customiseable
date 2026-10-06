"use server";

import { revalidatePath } from "next/cache";
import { markRead, toggleArticleFavorite } from "@/lib/learn";
import { requireSpace } from "@/lib/space";

export async function markReadAction(slug: string) {
  const space = await requireSpace();
  await markRead(space, slug);
  revalidatePath(`/learn/${slug}`);
  revalidatePath("/learn");
}

export async function toggleArticleFavoriteAction(slug: string) {
  const space = await requireSpace();
  const fav = await toggleArticleFavorite(space, slug);
  revalidatePath(`/learn/${slug}`);
  revalidatePath("/learn");
  return fav;
}
