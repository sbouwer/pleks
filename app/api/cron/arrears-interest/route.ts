import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accrueArrearsInterest } from "@/lib/finance/arrearsInterest"

// Daily arrears interest accrual — one charge per open case per day
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Find all open arrears cases with interest enabled
  const { data: cases } = await supabase
    .from("arrears_cases")
    .select("id, lease_id, leases(arrears_interest_enabled)")
    .not("status", "in", '("resolved","written_off","vacated_with_debt")')
    .gt("total_arrears_cents", 0)

  const today = new Date()
  let processed = 0
  let skipped = 0
  let totalInterestCents = 0

  for (const ac of cases ?? []) {
    const lease = ac.leases as unknown as { arrears_interest_enabled: boolean } | null
    if (!lease?.arrears_interest_enabled) {
      skipped++
      continue
    }

    const result = await accrueArrearsInterest(ac.id, today)
    if (result.skipped) {
      skipped++
    } else {
      processed++
      totalInterestCents += result.interestCents
    }
  }

  return Response.json({
    ok: true,
    cases_found: cases?.length ?? 0,
    processed,
    skipped,
    total_interest_cents: totalInterestCents,
  })
}
