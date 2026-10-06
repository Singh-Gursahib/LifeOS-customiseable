import { NextResponse } from "next/server";
import { SPACE_COOKIE } from "@/lib/session";

/** POST /api/auth/lock — drop the session and fall back to the PIN screen. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SPACE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
