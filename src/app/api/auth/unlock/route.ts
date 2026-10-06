import { NextRequest, NextResponse } from "next/server";
import { spaceForPin, checkThrottle, recordFailure, clearThrottle, noPinsConfigured } from "@/lib/auth";
import { signSession, sessionCookieOptions, SPACE_COOKIE } from "@/lib/session";

export const runtime = "nodejs"; // PIN hashing uses node:crypto

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/auth/unlock { pin } → sets the session cookie.
 *
 * The response is deliberately identical whichever PIN was entered: same shape,
 * same status, no space name. A correct PIN just returns ok — the caller has no
 * way to tell which vault it opened, and a wrong one gives nothing away either.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  let pin = "";
  try {
    pin = String(((await req.json()) as { pin?: unknown }).pin ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const throttle = await checkThrottle(ip);
  if (throttle.blocked) {
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${Math.ceil(throttle.retryInSec / 60)} min.` },
      { status: 429 }
    );
  }

  let space: Awaited<ReturnType<typeof spaceForPin>> = null;
  try {
    space = await spaceForPin(pin);
  } catch (err) {
    // Misconfiguration (missing AUTH_SECRET) — say so plainly rather than
    // masquerading as a wrong PIN, which would be maddening to debug.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Auth is not configured." },
      { status: 500 }
    );
  }

  if (!space) {
    if (await noPinsConfigured()) {
      // Fresh install: nothing to protect yet, so say what to do instead of a
      // denial that would leave a new user guessing. Not counted as a failure.
      return NextResponse.json(
        { ok: false, error: "NO ACCESS CODES SET — RUN: npm run spaces -- set-pin private <4 digits>" },
        { status: 503 }
      );
    }
    await recordFailure(ip);
    return NextResponse.json({ ok: false, error: "ACCESS DENIED" }, { status: 401 });
  }

  await clearThrottle(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SPACE_COOKIE, await signSession(space), sessionCookieOptions());
  return res;
}
