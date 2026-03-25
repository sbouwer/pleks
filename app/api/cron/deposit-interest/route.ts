import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getDepositBalance } from "@/lib/deposits/balance"

// Daily interest accrual for residential deposits (RHA s5)
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Find all active residential leases with deposits
  const { data: leases } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, lease_type")
    .in("status", ["active", "notice", "expired"])
    .gt("deposit_amount_cents", 0)
    .eq("lease_type", "residential")

  const today = new Date()
  let accrued = 0

  for (const lease of leases ?? []) {
    const balance = await getDepositBalance(lease.id)
    if (balance <= 0) continue

    // Default trust account savings rate: 4.5% p.a.
    const annualRate = 4.5
    const dailyRate = annualRate / 100 / 365
    const dailyInterest = Math.floor(balance * dailyRate)

    if (dailyInterest <= 0) continue

    await supabase.from("deposit_transactions").insert({
      org_id: lease.org_id,
      lease_id: lease.id,
      tenant_id: lease.tenant_id,
      transaction_type: "interest_accrued",
      direction: "credit",
      amount_cents: dailyInterest,
      description: `Daily interest — ${today.toISOString().split("T")[0]} — ${annualRate}% p.a.`,
    })

    accrued++
  }

  return Response.json({ ok: true, leases_accrued: accrued })
}
