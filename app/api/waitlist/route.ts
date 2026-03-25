import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { email, role } = await req.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
