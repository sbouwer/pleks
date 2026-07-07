/**
 * app/api/waitlist/route.ts — public waitlist signup (email + optional role)
 *
 * Route:  POST /api/waitlist
 * Auth:   none — public endpoint
 * Data:   inserts waitlist (service client)
 * Notes:  duplicate email (unique-violation 23505) is treated as success ("already on the list")
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { email, role } = await req.json()

  if (!email || !/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { error } = await supabase.from("waitlist").insert({
    email: email.toLowerCase().trim(),
    role: role || null,
  })

  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, message: "Already on the list" })
  }

  if (error) {
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
