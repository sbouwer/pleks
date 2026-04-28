import { NextResponse } from "next/server"
import { signAdminToken } from "@/lib/auth/admin-token"

export async function POST(req: Request) {
  const { secret } = await req.json() as { secret?: string }
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret || secret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  // Issue a signed, expiring token — ADMIN_SECRET never appears in the cookie value.
  const token = await signAdminToken(adminSecret)

  const response = NextResponse.json({ ok: true })
  response.headers.set(
    "Set-Cookie",
    [
      `pleks_admin_token=${token}`,
      "Path=/admin",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=86400",
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ].filter(Boolean).join("; ")
  )
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.headers.set(
    "Set-Cookie",
    "pleks_admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0"
  )
  return response
}
