import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { startOfMonth, endOfMonth, setDate } from "date-fns"

function buildPaymentReference(lastName: string | null, unitNumber: string | null): string {
  const surname = (lastName ?? "TENANT")
    .toUpperCase()
    .replaceAll(/\s+/g, "")
    .replaceAll(/[^A-Z0-9]/g, "")
    .slice(0, 10)
  const unit = (unitNumber ?? "U1")
    .toUpperCase()
    .replaceAll(/\s+/g, "")
    .replaceAll(/[^A-Z0-9]/g, "")
    .slice(0, 6)
  return `${surname}-${unit}`
}

interface ChargeRow {
  lease_id: string
  charge_type: string
  description: string
  amount_cents: number
}

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

  // Get all active leases with tenant + unit for payment reference
  const { data: leases } = await supabase
    .from("leases")
    .select("id, org_id, unit_id, property_id, tenant_id, rent_amount_cents, payment_due_day, tenant_view(last_name), units(unit_number)")
    .in("status", ["active", "month_to_month", "notice"])

  const leaseIds = (leases ?? []).map((l) => l.id)

  // Batch-fetch all active lease_charges applicable to this period.
  // A charge applies if started by period_to and not ended before period_from.
  const { data: allCharges } = leaseIds.length > 0
    ? await supabase
        .from("lease_charges")
        .select("lease_id, charge_type, description, amount_cents")
        .in("lease_id", leaseIds)
        .eq("is_active", true)
        .lte("start_date", periodTo)
        .or(`end_date.is.null,end_date.gte.${periodFrom}`)
    : { data: [] }

  const chargesByLease = new Map<string, ChargeRow[]>()
  for (const c of (allCharges ?? []) as ChargeRow[]) {
    const rows = chargesByLease.get(c.lease_id) ?? []
    rows.push(c)
    chargesByLease.set(c.lease_id, rows)
  }

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

    const tenantView = lease.tenant_view as unknown as { last_name: string | null } | null
    const unit = lease.units as unknown as { unit_number: string | null } | null
    const paymentReference = buildPaymentReference(tenantView?.last_name ?? null, unit?.unit_number ?? null)

    const leaseCharges = chargesByLease.get(lease.id) ?? []
    const otherChargesCents = leaseCharges.reduce((s, c) => s + c.amount_cents, 0)
    const chargesBreakdown = leaseCharges.map((c) => ({
      type: c.charge_type,
      description: c.description,
      amount_cents: c.amount_cents,
    }))
    const totalAmountCents = lease.rent_amount_cents + otherChargesCents

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
      other_charges_cents: otherChargesCents,
      charges_breakdown: chargesBreakdown.length > 0 ? chargesBreakdown : null,
      total_amount_cents: totalAmountCents,
      balance_cents: totalAmountCents,
      payment_reference: paymentReference,
      status: "open",
    })

    generated++
  }

  return NextResponse.json({ ok: true, generated })
}
