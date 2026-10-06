"use server";

import { revalidatePath } from "next/cache";
import { saveDocument, toggleFavorite, touchAccessed } from "@/lib/mutations";
import { requireSpace } from "@/lib/space";

// The space always comes from the session cookie, never from a client argument —
// otherwise the browser could ask to write into the other vault.
export async function saveNoteAction(path: string, content: string) {
  const space = await requireSpace();
  const res = await saveDocument(space, path, content);
  revalidatePath(`/vault/${path.replace(/\.md$/, "")}`);
  revalidatePath("/vault");
  revalidatePath("/");
  return res;
}

export async function toggleFavoriteAction(path: string) {
  const space = await requireSpace();
  const fav = await toggleFavorite(space, path);
  revalidatePath(`/vault/${path.replace(/\.md$/, "")}`);
  revalidatePath("/");
  return fav;
}

export async function touchAction(path: string) {
  const space = await requireSpace();
  await touchAccessed(space, path);
}
