import { NextRequest, NextResponse } from "next/server";
import { SPACE_COOKIE, verifySession } from "@/lib/session";

/**
 * The gate. Nothing renders until the browser presents a valid session cookie,
 * so there is no URL that leaks a page — or even a page title — to a stranger.
 *
 * Runs on every request except Next's own assets, files with an extension
 * (icons, manifest, sw.js) and the auth endpoints themselves.
 */
export const config = {
  matcher: ["/((?!_next/|api/auth/|.*\\.[\\w]+$).*)"],
};

export default async function proxy(req: NextRequest) {
  const space = await verifySession(req.cookies.get(SPACE_COOKIE)?.value);
  const isLock = req.nextUrl.pathname === "/lock";

  if (!space) {
    if (isLock) return NextResponse.next();
    // API calls get a status, not a redirect — a 302 to an HTML page is useless to
    // fetch(), and this is what stops a stranger burning transcription credits.
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Locked" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/lock";
    url.search = "";
    // 'no-store' so an unlocked page can never be replayed from bfcache after locking
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  }

  if (isLock) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // From the decoy, /settings must be indistinguishable from a path that was never
  // a route. Letting the page render and call notFound() leaks a different status
  // and body size, so rewrite to a dead path and let the normal 404 answer.
  if (space !== "private" && req.nextUrl.pathname.startsWith("/settings")) {
    const url = req.nextUrl.clone();
    url.pathname = "/__nx";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const res = NextResponse.next();
  // Belt and braces: never let a shared cache hold a rendered page from either space.
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
