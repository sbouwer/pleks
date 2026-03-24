import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { startOfMonth, endOfMonth, setDate } from "date-fns"

export async function GET(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date()
  const periodFrom = startOfMonth(today).toISOString().split("T")[0]
  const periodTo = endOfMonth(today).toISOString().split("T")[0]
  let generated = 0

  // Get all active leases
  const { data: leases } = await supabase
    .from("leases")
    .select("id, org_id, unit_id, property_id, tenant_id, rent_amount_cents, payment_due_day")
    .in("status", ["active", "month_to_month", "notice"])

  for (const lease of leases || []) {
    // Check no duplicate
    const { data: existing } = await supabase
      .from("rent_invoices")
      .select("id")
      .eq("lease_id", lease.id)
      .eq("period_from", periodFrom)
      .limit(1)

    if (existing && existing.length > 0) continue

    // Generate invoice number
    const { count } = await supabase
      .from("rent_invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", lease.org_id)

    const seq = ((count || 0) + 1).toString().padStart(5, "0")
    const invoiceNumber = `PLEKS-${today.getFullYear()}-${seq}`

    const dueDay = Math.min(lease.payment_due_day || 1, 28)
    const dueDate = setDate(today, dueDay).toISOString().split("T")[0]

    await supabase.from("rent_invoices").insert({
      org_id: lease.org_id,
      lease_id: lease.id,
      unit_id: lease.unit_id,
      tenant_id: lease.tenant_id,
      invoice_number: invoiceNumber,
      invoice_date: today.toISOString().split("T")[0],
      due_date: dueDate,
      period_from: periodFrom,
      period_to: periodTo,
      rent_amount_cents: lease.rent_amount_cents,
      total_amount_cents: lease.rent_amount_cents,
      balance_cents: lease.rent_amount_cents,
      status: "open",
    })

    generated++
  }

  return NextResponse.json({ ok: true, generated })
}
