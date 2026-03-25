import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { secret } = await req.json()
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret || secret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.headers.set(
    "Set-Cookie",
    [
      `pleks_admin_token=${secret}`,
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
