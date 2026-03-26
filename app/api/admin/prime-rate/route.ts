import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  if (!token || token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { rate_percent, effective_date, mpc_meeting_date, notes } = await req.json()

  if (!rate_percent || !effective_date) {
    return NextResponse.json({ error: "Rate and effective date required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { error } = await supabase.from("prime_rates").insert({
    rate_percent,
    effective_date,
    mpc_meeting_date,
    notes,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
