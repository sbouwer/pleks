import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"

// Public GET — returns current prime rate (no auth needed)
export async function GET() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date, notes")
    .order("effective_date", { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    rate_percent: data?.rate_percent ?? 10.25,
    effective_date: data?.effective_date ?? "2025-11-21",
    notes: data?.notes ?? null,
  })
}

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
