import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date()
  const periodMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  // Get all active HOA entities
  const { data: hoaEntities } = await supabase
    .from("hoa_entities")
    .select("id, org_id, name")
    .eq("is_active", true)

  let generated = 0

  for (const hoa of hoaEntities ?? []) {
    // Get active levy schedule
    const { data: schedule } = await supabase
      .from("levy_schedules")
      .select("id, total_budget_cents, admin_reserve_split_percent")
      .eq("hoa_id", hoa.id)
      .eq("is_active", true)
      .in("schedule_type", ["admin_levy", "reserve_levy"])
      .lte("effective_from", periodMonth.toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .single()

    if (!schedule) continue

    // Get active owners
    const { data: owners } = await supabase
      .from("hoa_unit_owners")
      .select("id, unit_id, owner_name, owner_email")
      .eq("hoa_id", hoa.id)
      .eq("is_active", true)
      .is("owned_until", null)

    for (const owner of owners ?? []) {
      // Skip if invoice already exists
      const { data: existing } = await supabase
        .from("levy_invoices")
        .select("id")
        .eq("owner_id", owner.id)
        .eq("period_month", periodMonth.toISOString())
        .maybeSingle()

      if (existing) continue

      // Get pre-calculated amount
      const { data: unitAmount } = await supabase
        .from("levy_unit_amounts")
        .select("calculated_cents")
        .eq("schedule_id", schedule.id)
        .eq("owner_id", owner.id)
        .single()

      const totalCents = unitAmount?.calculated_cents ?? 0
      if (totalCents <= 0) continue

      const split = (schedule.admin_reserve_split_percent ?? 80) / 100
      const adminLevy = Math.round(totalCents * split)
      const reserveLevy = totalCents - adminLevy

      // Get arrears from prior invoices
      const { data: priorOverdue } = await supabase
        .from("levy_invoices")
        .select("balance_cents")
        .eq("owner_id", owner.id)
        .in("status", ["open", "overdue", "partial"])
        .lt("period_month", periodMonth.toISOString())

      const arrears = (priorOverdue ?? []).reduce((s, i) => s + (i.balance_cents ?? 0), 0)
      const invoiceTotal = totalCents + arrears

      // Generate invoice number
      const seq = `${hoa.id.slice(0, 4)}-${periodMonth.getFullYear()}${String(periodMonth.getMonth() + 1).padStart(2, "0")}-${owner.id.slice(0, 4)}`

      const dueDate = new Date(today)
      dueDate.setDate(dueDate.getDate() + 7)

      await supabase.from("levy_invoices").insert({
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
      })

      generated++
    }
  }

  return Response.json({ ok: true, invoices_generated: generated })
}
