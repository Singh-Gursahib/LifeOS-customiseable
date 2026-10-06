import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SPACE_COOKIE, SpaceId, verifySession } from "./session";

/**
 * The space (account) the current request is unlocked into. Every data function
 * takes this explicitly — nothing reads the DB without it, which is what keeps
 * the two vaults from ever seeing each other.
 *
 * Reading the cookie makes a page dynamic. That's intentional: a cached page
 * rendered for one space must never be replayed to the other.
 */
export async function currentSpace(): Promise<SpaceId | null> {
  const jar = await cookies();
  return verifySession(jar.get(SPACE_COOKIE)?.value);
}

/** Same, but bounces to the lock screen when there's no valid session. */
export async function requireSpace(): Promise<SpaceId> {
  const space = await currentSpace();
  if (!space) redirect("/lock");
  return space;
}
