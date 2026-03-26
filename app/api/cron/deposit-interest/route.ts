import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accrueDepositInterest } from "@/lib/finance/depositInterest"

// Monthly deposit interest accrual — uses per-lease rate settings
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Find all active residential leases with deposits
  const { data: leases } = await supabase
    .from("leases")
    .select("id")
    .in("status", ["active", "notice", "expired"])
    .gt("deposit_amount_cents", 0)

  const today = new Date()
  let accrued = 0
  let totalInterestCents = 0

  for (const lease of leases ?? []) {
    const result = await accrueDepositInterest(lease.id, today)
    if (result.interestCents > 0) {
      accrued++
      totalInterestCents += result.interestCents
    }
  }

  return Response.json({
    ok: true,
    leases_processed: leases?.length ?? 0,
    leases_accrued: accrued,
    total_interest_cents: totalInterestCents,
  })
}
