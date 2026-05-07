/**
 * app/api/cron/invoice-generate/route.ts — Monthly rent invoice generation for all active leases
 *
 * Route:  GET /api/cron/invoice-generate
 * Auth:   x-cron-secret header — called by daily orchestrator, not directly by Vercel
 * Data:   leases, lease_charges, rent_invoices via service client
 * Notes:  BUILD_63 Phase 7 (F1): fires rent.invoice_issued comm after each insert.
 */
import * as React from "react"
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { startOfMonth, endOfMonth, setDate } from "date-fns"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { InvoiceIssuedEmail } from "@/lib/comms/templates/tenant/rent/invoice-issued"

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

function fmt(cents: number) {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

interface ChargeRow {
  lease_id: string
  charge_type: string
  description: string
  amount_cents: number
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

async function fetchChargesByLease(
  supabase: ServiceClient,
  leaseIds: string[],
  periodFrom: string,
  periodTo: string,
): Promise<Map<string, ChargeRow[]>> {
  const map = new Map<string, ChargeRow[]>()
  if (leaseIds.length === 0) return map
  const { data } = await supabase
    .from("lease_charges")
    .select("lease_id, charge_type, description, amount_cents")
    .in("lease_id", leaseIds)
    .eq("is_active", true)
    .lte("start_date", periodTo)
    .or(`end_date.is.null,end_date.gte.${periodFrom}`)
  for (const c of (data ?? []) as ChargeRow[]) {
    const rows = map.get(c.lease_id) ?? []
    rows.push(c)
    map.set(c.lease_id, rows)
  }
  return map
}

interface InvoiceCommParams {
  orgId: string
  tenantId: string
  tenantEmail: string
  tenantPhone: string | null
  tenantName: string
  propertyLabel: string
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  periodFrom: string
  periodTo: string
  rentAmountCents: number
  otherChargesCents: number
  totalAmountCents: number
  paymentReference: string
  chargesBreakdown: { description: string; amount_cents: number }[]
}

async function fireInvoiceIssuedComm(p: InvoiceCommParams) {
  const orgSettings = await fetchOrgSettings(p.orgId)
  const branding = buildBranding(orgSettings)
  await routeAndSend({
    orgId:       p.orgId,
    tenantId:    p.tenantId,
    templateKey: "rent.invoice_issued",
    to: { email: p.tenantEmail, phone: p.tenantPhone ?? undefined, name: p.tenantName },
    subject: `Rent invoice ${p.invoiceNumber} — due ${fmtDate(p.dueDate)}`,
    emailElement: React.createElement(InvoiceIssuedEmail, {
      branding,
      tenantName:          p.tenantName,
      propertyLabel:       p.propertyLabel,
      invoiceNumber:       p.invoiceNumber,
      invoiceDate:         fmtDate(p.invoiceDate),
      dueDate:             fmtDate(p.dueDate),
      periodFrom:          fmtDate(p.periodFrom),
      periodTo:            fmtDate(p.periodTo),
      rentAmountDisplay:   fmt(p.rentAmountCents),
      otherChargesDisplay: p.otherChargesCents > 0 ? fmt(p.otherChargesCents) : null,
      totalAmountDisplay:  fmt(p.totalAmountCents),
      paymentReference:    p.paymentReference,
      chargesBreakdown:    p.chargesBreakdown.map((c) => ({ description: c.description, amount: fmt(c.amount_cents) })),
    }),
    entityType:       "invoice",
    entityId:         p.invoiceId,
    triggerEventType: "cron:invoice_generate",
    triggerEventId:   p.invoiceId,
    toneVariant:      "n/a",
  })
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
    .select("id, org_id, unit_id, property_id, tenant_id, rent_amount_cents, payment_due_day, tenant_view(first_name, last_name, email, phone), units(unit_number, properties(address_line1, suburb, city))")
    .in("status", ["active", "month_to_month", "notice"])

  const leaseIds = (leases ?? []).map((l) => l.id)
  const chargesByLease = await fetchChargesByLease(supabase, leaseIds, periodFrom, periodTo)

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

    type TenantViewRow = { first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
    type PropRow = { address_line1: string | null; suburb: string | null; city: string | null }
    type UnitRow = { unit_number: string | null; properties: PropRow | PropRow[] | null }
    const tenantView = lease.tenant_view as unknown as TenantViewRow | null
    const unit = lease.units as unknown as UnitRow | null
    const rawProps = unit?.properties ?? null
    const prop = Array.isArray(rawProps) ? rawProps[0] : rawProps
    const paymentReference = buildPaymentReference(tenantView?.last_name ?? null, unit?.unit_number ?? null)

    const leaseCharges = chargesByLease.get(lease.id) ?? []
    const otherChargesCents = leaseCharges.reduce((s, c) => s + c.amount_cents, 0)
    const chargesBreakdown = leaseCharges.map((c) => ({
      type: c.charge_type,
      description: c.description,
      amount_cents: c.amount_cents,
    }))
    const totalAmountCents = lease.rent_amount_cents + otherChargesCents

    const { data: inserted, error: insertError } = await supabase.from("rent_invoices").insert({
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
    }).select("id").single()

    if (insertError) {
      console.error("[invoice-generate] insert failed for lease", lease.id, insertError.message)
      continue
    }

    generated++

    if (tenantView?.email) {
      const propertyLabel = prop
        ? [prop.address_line1, unit?.unit_number ? `Unit ${unit.unit_number}` : null, prop.suburb ?? prop.city].filter(Boolean).join(", ")
        : "your property"
      try {
        await fireInvoiceIssuedComm({
          orgId:            lease.org_id as string,
          tenantId:         lease.tenant_id as string,
          tenantEmail:      tenantView.email,
          tenantPhone:      tenantView.phone ?? null,
          tenantName:       [tenantView.first_name, tenantView.last_name].filter(Boolean).join(" ") || "Tenant",
          propertyLabel,
          invoiceId:        inserted.id,
          invoiceNumber,
          invoiceDate:      today.toISOString().split("T")[0],
          dueDate,
          periodFrom,
          periodTo,
          rentAmountCents:  lease.rent_amount_cents,
          otherChargesCents,
          totalAmountCents,
          paymentReference,
          chargesBreakdown,
        })
      } catch (err) {
        console.error("[invoice-generate] comm failed for lease", lease.id, err)
      }
    }
  }

  if (process.env.HEARTBEAT_INVOICE_GENERATE) {
    void fetch(process.env.HEARTBEAT_INVOICE_GENERATE, { method: "POST" }).catch(() => undefined)
  }

  return NextResponse.json({ ok: true, generated })
}
