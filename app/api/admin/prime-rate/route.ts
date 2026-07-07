/**
 * app/api/admin/prime-rate/route.ts — read current prime rate / record a new one
 *
 * Route:  GET, POST /api/admin/prime-rate
 * Auth:   GET is public (no gate); POST requires isAdminAuthenticated()
 * Data:   reads/inserts prime_rates
 * Notes:  GET returns hardcoded fallback (10.25% / 2025-11-21) when the table is empty
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

// Public GET — returns current prime rate (no auth needed)
export async function GET() {
  const supabase = await createServiceClient()
  const { data, error: queryError } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date, notes")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("GET prime_rates", queryError)

  return NextResponse.json({
    rate_percent: data?.rate_percent ?? 10.25,
    effective_date: data?.effective_date ?? "2025-11-21",
    notes: data?.notes ?? null,
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
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
