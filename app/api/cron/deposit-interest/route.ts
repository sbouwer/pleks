/**
 * app/api/cron/deposit-interest/route.ts — monthly deposit interest accrual (per-lease rate)
 *
 * Route:  GET /api/cron/deposit-interest
 * Auth:   x-cron-secret header must equal CRON_SECRET
 * Data:   reads leases with deposits (active/notice/expired); accrues via accrueDepositInterest
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accrueDepositInterest } from "@/lib/finance/depositInterest"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

// Monthly deposit interest accrual — uses per-lease rate settings
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()

  // Find all active residential leases with deposits
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id")
    .in("status", ["active", "notice", "expired"])
    .gt("deposit_amount_cents", 0)
    logQueryError("GET leases", leasesError)

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
