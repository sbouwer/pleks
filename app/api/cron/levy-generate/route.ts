/**
 * app/api/cron/levy-generate/route.ts — monthly HOA levy invoice generation cron
 *
 * Route:  /api/cron/levy-generate
 * Auth:   x-cron-secret header (CRON_SECRET); service client (bypasses RLS)
 * Data:   hoa_entities → levy_schedules / hoa_unit_owners / levy_unit_amounts / levy_invoices
 * Notes:  Idempotent per period — skips owners who already have an invoice for the month.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"

function logErr(label: string, error: { message: string } | null) {
  if (error) console.error(`${label}:`, error.message)
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  const today = new Date()
  const periodMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  // Get all active HOA entities
  const { data: hoaEntities, error: hoaEntitiesError } = await supabase
    .from("hoa_entities")
    .select("id, org_id, name")
    .eq("is_active", true)
  logErr("levy-generate hoa_entities read failed", hoaEntitiesError)

  let generated = 0

  for (const hoa of hoaEntities ?? []) {
    // Get active levy schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("levy_schedules")
      .select("id, total_budget_cents, admin_reserve_split_percent")
      .eq("hoa_id", hoa.id)
      .eq("is_active", true)
      .in("schedule_type", ["admin_levy", "reserve_levy"])
      .lte("effective_from", periodMonth.toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()

    logErr("levy-generate levy_schedules read failed", scheduleError)
    if (!schedule) continue

    // Get active owners
    const { data: owners, error: ownersError } = await supabase
      .from("hoa_unit_owners")
      .select("id, unit_id, owner_name, owner_email")
      .eq("hoa_id", hoa.id)
      .eq("is_active", true)
      .is("owned_until", null)
    logErr("levy-generate hoa_unit_owners read failed", ownersError)

    for (const owner of owners ?? []) {
      // Skip if invoice already exists
      const { data: existing, error: existingError } = await supabase
        .from("levy_invoices")
        .select("id")
        .eq("owner_id", owner.id)
        .eq("period_month", periodMonth.toISOString())
        .maybeSingle()

      logErr("levy-generate levy_invoices existing-check failed", existingError)
      if (existing) continue

      // Get pre-calculated amount
      const { data: unitAmount, error: unitAmountError } = await supabase
        .from("levy_unit_amounts")
        .select("calculated_cents")
        .eq("schedule_id", schedule.id)
        .eq("owner_id", owner.id)
        .single()
      logErr("levy-generate levy_unit_amounts read failed", unitAmountError)

      const totalCents = unitAmount?.calculated_cents ?? 0
      if (totalCents <= 0) continue

      const split = (schedule.admin_reserve_split_percent ?? 80) / 100
      const adminLevy = Math.round(totalCents * split)
      const reserveLevy = totalCents - adminLevy

      // Get arrears from prior invoices
      const { data: priorOverdue, error: priorOverdueError } = await supabase
        .from("levy_invoices")
        .select("balance_cents")
        .eq("owner_id", owner.id)
        .in("status", ["open", "overdue", "partial"])
        .lt("period_month", periodMonth.toISOString())
      logErr("levy-generate levy_invoices arrears read failed", priorOverdueError)

      const arrears = (priorOverdue ?? []).reduce((s, i) => s + (i.balance_cents ?? 0), 0)
      const invoiceTotal = totalCents + arrears

      // Generate invoice number
      const seq = `${hoa.id.slice(0, 4)}-${periodMonth.getFullYear()}${String(periodMonth.getMonth() + 1).padStart(2, "0")}-${owner.id.slice(0, 4)}`

      const dueDate = new Date(today)
      dueDate.setDate(dueDate.getDate() + 7)

      // Upsert with ON CONFLICT DO NOTHING on the unique (owner_id, period_month) index — a concurrent run that
      // already created this owner's levy for the period is a no-op (no double-levy), and the race loser gets no
      // row back so it isn't counted. The existence check above is now just a fast path. (double-post fix 2026-07-07.)
      const { data: levyInserted, error: levyInsertError } = await supabase
        .from("levy_invoices")
        .upsert({
          org_id: hoa.org_id,
          hoa_id: hoa.id,
          unit_id: owner.unit_id,
          owner_id: owner.id,
          schedule_id: schedule.id,
          invoice_number: `LEV-${seq}`,
          invoice_date: today.toISOString().split("T")[0],
          due_date: dueDate.toISOString().split("T")[0],
          period_month: periodMonth.toISOString(),
          admin_levy_cents: adminLevy,
          reserve_levy_cents: reserveLevy,
          arrears_cents: arrears,
          total_cents: invoiceTotal,
          balance_cents: invoiceTotal,
          status: "open",
        }, { onConflict: "owner_id,period_month", ignoreDuplicates: true })
        .select("id")
        .maybeSingle()
      logErr("levy-generate levy_invoices insert failed", levyInsertError)

      if (levyInserted) generated++
    }
  }

  return Response.json({ ok: true, invoices_generated: generated })
}
