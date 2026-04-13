/**
 * GET /api/tenants/[tenantId]/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns an HTML tenant statement (open in new tab → print to PDF).
 */

import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildTenantStatementHTML } from "@/lib/pdf/tenantStatement"
import { redirect } from "next/navigation"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params

  // Auth check
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) return new Response("Unauthorized", { status: 401 })
  const orgId = membership.org_id

  // Tenant info
  const { data: tenant } = await service
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, entity_type")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!tenant) return new Response("Not found", { status: 404 })

  const tenantName = tenant.entity_type === "company"
    ? (tenant.company_name ?? "Tenant")
    : `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() || "Tenant"

  // Period from query params
  const url = new URL(req.url)
  const fromDate = url.searchParams.get("from") ?? undefined
  const toDate = url.searchParams.get("to") ?? undefined

  // Fetch ledger data
  const [invoicesRes, paymentsRes, depositRes, leaseRes] = await Promise.all([
    service
      .from("rent_invoices")
      .select("id, invoice_number, due_date, total_amount_cents, period_from, period_to")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId)
      .order("due_date", { ascending: true }),
    service
      .from("payments")
      .select("id, payment_date, amount_cents, payment_method, reference, receipt_number")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId)
      .order("payment_date", { ascending: true }),
    service
      .from("deposit_transactions")
      .select("amount_cents, direction, transaction_type")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId),
    service
      .from("leases")
      .select("id, units(unit_number, properties(name))")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId)
      .in("status", ["active", "notice", "month_to_month"])
      .limit(1)
      .maybeSingle(),
  ])

  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const depositTxns = depositRes.data ?? []

  // Deposit balance
  const depositHeld = depositTxns.reduce((sum, t) =>
    sum + (t.direction === "credit" ? t.amount_cents : -t.amount_cents), 0)

  // Lease location
  const lease = leaseRes.data
  const unit = lease ? (lease.units as unknown as { unit_number: string; properties: { name: string } } | null) : null
  const unitNumber = unit?.unit_number ?? "—"
  const propertyName = unit?.properties?.name ?? "—"

  // Build ledger entries
  type StatEntry = { date: string; description: string; debitCents: number; creditCents: number; ref: string | null }
  const entries: StatEntry[] = [
    ...invoices
      .filter((i) => {
        if (fromDate && i.due_date < fromDate) return false
        if (toDate && i.due_date > toDate) return false
        return true
      })
      .map((i) => ({
        date: new Date(i.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }),
        description: "Rent invoice" + (i.period_from ? ` · ${i.period_from} to ${i.period_to ?? ""}` : ""),
        debitCents: i.total_amount_cents,
        creditCents: 0,
        ref: i.invoice_number,
      })),
    ...payments
      .filter((p) => {
        if (fromDate && p.payment_date < fromDate) return false
        if (toDate && p.payment_date > toDate) return false
        return true
      })
      .map((p) => ({
        date: new Date(p.payment_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }),
        description: "Payment received · " + p.payment_method.replaceAll("_", " "),
        debitCents: 0,
        creditCents: p.amount_cents,
        ref: p.receipt_number ?? p.reference,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount_cents, 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount_cents, 0)

  // Org info
  const { data: org } = await service
    .from("organisations")
    .select("name, logo_url, address_line1, suburb, city")
    .eq("id", orgId)
    .single()

  const orgAddress = [org?.address_line1, org?.suburb, org?.city].filter(Boolean).join(", ")

  const html = buildTenantStatementHTML({
    tenant_name: tenantName,
    property_name: propertyName,
    unit_number: unitNumber,
    period_from: fromDate ?? (invoices[0]?.due_date ?? "—"),
    period_to: toDate ?? (invoices[invoices.length - 1]?.due_date ?? "—"),
    entries,
    current_balance_cents: totalInvoiced - totalPaid,
    deposit_held_cents: Math.max(0, depositHeld),
    org_name: org?.name ?? "Property Management",
    org_logo_url: org?.logo_url ?? null,
    org_address: orgAddress || null,
  })

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="statement-${tenantId.slice(0, 8)}.html"`,
    },
  })
}
