/**
 * app/api/admin/logout/route.ts — Clears the admin session cookie
 *
 * Route:  POST /api/admin/logout
 * Auth:   None required — clearing the cookie is always allowed
 */
import { NextResponse } from "next/server"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set("pleks_admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
  })
  return res
}
