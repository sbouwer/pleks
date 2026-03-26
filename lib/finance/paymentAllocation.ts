import { createServiceClient } from "@/lib/supabase/server"

/**
 * Allocates an incoming payment per lease clause 6.6:
 * "payments will first be allocated to interest or damages,
 *  then to outstanding rent."
 *
 * Order:
 *   1. Outstanding arrears interest charges (oldest date first)
 *   2. Open rent invoices (oldest due date first)
 *   3. Surplus recorded on payment for disposition
 */
export async function allocatePayment(
  paymentId: string,
  leaseId: string,
  amountCents: number
): Promise<{
  interestAppliedCents: number
  rentAppliedCents: number
  surplusCents: number
}> {
  const supabase = await createServiceClient()
  let remaining = amountCents
  let interestApplied = 0

  // STEP 1 — Consume outstanding interest first (oldest charges first)
  const { data: charges } = await supabase
    .from("arrears_interest_charges")
    .select("id, interest_cents, arrears_case_id")
    .eq("lease_id", leaseId)
    .eq("waived", false)
    .order("charge_date", { ascending: true })

  if (charges?.length) {
    for (const charge of charges) {
      if (remaining <= 0) break
      const apply = Math.min(remaining, charge.interest_cents)
      await supabase
        .from("arrears_interest_charges")
        .update({
          waived: true,
          waived_reason: `Consumed by payment ${paymentId}`,
          waived_at: new Date().toISOString(),
        })
        .eq("id", charge.id)
      remaining -= apply
      interestApplied += apply
    }

    if (interestApplied > 0) {
      // Update payment record with interest portion
      await supabase
        .from("payments")
        .update({ interest_applied_cents: interestApplied })
        .eq("id", paymentId)

      // Refresh interest total on each affected arrears case
      const caseIds = [...new Set(charges.map((c) => c.arrears_case_id))]
      for (const caseId of caseIds) {
        await supabase.rpc("refresh_arrears_interest_total", {
          p_case_id: caseId,
        })
      }
    }
  }

  // STEP 2 — Apply remainder to open invoices (oldest first)
  const { data: invoices } = await supabase
    .from("rent_invoices")
    .select("id, balance_cents, due_date")
    .eq("lease_id", leaseId)
    .in("status", ["open", "partial", "overdue"])
    .order("due_date", { ascending: true })

  let rentApplied = 0
  if (invoices) {
    for (const invoice of invoices) {
      if (remaining <= 0) break
      const balance = invoice.balance_cents ?? 0
      if (balance <= 0) continue
      const apply = Math.min(remaining, balance)
      const newBalance = balance - apply
      await supabase
        .from("rent_invoices")
        .update({
          amount_paid_cents: apply,
          balance_cents: newBalance,
          status: newBalance <= 0 ? "paid" : "partial",
          paid_at: newBalance <= 0 ? new Date().toISOString() : null,
        })
        .eq("id", invoice.id)
      remaining -= apply
      rentApplied += apply
    }
  }

  return {
    interestAppliedCents: interestApplied,
    rentAppliedCents: rentApplied,
    surplusCents: remaining,
  }
}
