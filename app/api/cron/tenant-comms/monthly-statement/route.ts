/**
 * app/api/cron/tenant-comms/monthly-statement/route.ts — monthly account statement per org
 *
 * Route:  GET /api/cron/tenant-comms/monthly-statement
 * Auth:   x-cron-secret header — called daily by orchestrator
 * Data:   organisations, leases, rent_invoices, payments via service client
 * Notes:  Runs daily. For each org, checks settings.preferences.monthly_statement_day (default 3).
 *         Fires only for orgs whose configured day matches today's UTC date.
 *         Statement covers the previous calendar month. BUILD_63 Phase 7 (F3).
 */

import * as React from "react"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding, type OrgBranding } from "@/lib/comms/send-email"
import { MonthlyStatementEmail, type StatementInvoiceRow, type StatementPaymentRow } from "@/lib/comms/templates/tenant/rent/monthly-statement"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"
import { addCalendarDays, addCalendarMonths, fmtZA, monthEnd, monthStart, saTodayISO } from "@/lib/dates"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

function fmt(cents: number) {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

function getStatementDay(settings: Record<string, unknown> | null): number {
  const prefs = (settings?.preferences as Record<string, unknown> | null) ?? {}
  return typeof prefs.monthly_statement_day === "number" ? prefs.monthly_statement_day : 3
}

interface LeaseStatementContext {
  leaseId: string
  tenantId: string
  unitId: string
  orgId: string
  orgName: string
  branding: OrgBranding
  senderName: string
  periodFrom: string
  periodTo: string
  statementMonthLabel: string
}

async function buildPropertyLabel(service: ServiceClient, unitId: string): Promise<string> {
  const { data: unitRow, error: unitRowError } = await service
    .from("units")
    .select("unit_number, properties(address_line1, suburb, city)")
    .eq("id", unitId)
    .single()
    logQueryError("buildPropertyLabel units", unitRowError)
  type PropRow = { address_line1: string | null; suburb: string | null; city: string | null }
  type UnitRow = { unit_number: string | null; properties: PropRow | PropRow[] | null }
  const unitData = unitRow as unknown as UnitRow | null
  const rawProps = unitData?.properties ?? null
  const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
  return propData
    ? [propData.address_line1, unitData?.unit_number ? `Unit ${unitData.unit_number}` : null, propData.suburb ?? propData.city].filter(Boolean).join(", ")
    : "your property"
}

async function buildInvoiceRows(service: ServiceClient, leaseId: string, periodFrom: string, periodTo: string): Promise<StatementInvoiceRow[] | null> {
  const { data, error } = await service
    .from("rent_invoices")
    .select("invoice_number, period_from, period_to, total_amount_cents, balance_cents, status")
    .eq("lease_id", leaseId)
    .gte("period_from", periodFrom)
    .lte("period_to", periodTo)
  if (error) return null
  return (data ?? []).map((r) => ({
    invoiceNumber:  r.invoice_number as string,
    periodLabel:    `${fmtShort(r.period_from as string)} – ${fmtShort(r.period_to as string)}`,
    totalDisplay:   fmt(r.total_amount_cents as number),
    balanceDisplay: fmt((r.balance_cents as number | null) ?? 0),
    status:         r.status as string,
  }))
}

async function buildPaymentRows(service: ServiceClient, leaseId: string, periodFrom: string, periodTo: string): Promise<StatementPaymentRow[] | null> {
  const { data, error } = await service
    .from("payments")
    .select("payment_date, amount_cents, payment_method, receipt_number")
    .eq("lease_id", leaseId)
    .gte("payment_date", periodFrom)
    .lte("payment_date", periodTo)
    .order("payment_date", { ascending: true })
  if (error) return null
  return (data ?? []).map((r) => ({
    paymentDate:   new Date(r.payment_date as string).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }),
    amountDisplay: fmt(r.amount_cents as number),
    method:        (r.payment_method as string).toUpperCase(),
    receiptNumber: r.receipt_number as string,
  }))
}

async function getClosingBalance(service: ServiceClient, leaseId: string): Promise<number> {
  const { data, error: queryError } = await service
    .from("rent_invoices")
    .select("balance_cents")
    .eq("lease_id", leaseId)
    .in("status", ["open", "partial", "overdue"])
    logQueryError("getClosingBalance rent_invoices", queryError)
  return (data ?? []).reduce((sum, r) => sum + ((r.balance_cents as number | null) ?? 0), 0)
}

async function sendLeaseStatement(service: ServiceClient, ctx: LeaseStatementContext): Promise<boolean> {
  // Idempotency (replay/double-send guard): the statement fires once per calendar cycle. If a
  // rent.monthly_statement was already logged for this lease since the start of the current send month
  // (the day after periodTo), a re-fire (cPanel retry, manual re-run) must NOT re-email it. The other
  // money crons carry the same check-before-write (ADDENDUM_TRUST_RPC_ATOMICITY §7).
  const cycleStart = addCalendarDays(ctx.periodTo, 1)   // calendar arithmetic on an SA-resolved date
  const { data: alreadySent, error: dupError } = await service
    .from("communication_log").select("id")
    .eq("entity_type", "lease").eq("entity_id", ctx.leaseId)
    // M-2 (comms audit): only a SUCCESSFUL prior send blocks — a failed one must not suppress the retry.
    .eq("template_key", "rent.monthly_statement").eq("status", "sent").gte("created_at", cycleStart).limit(1)
  logQueryError("sendLeaseStatement dedupe", dupError)
  if (alreadySent && alreadySent.length > 0) return false

  const { data: tenant, error: tenantError } = await service
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", ctx.tenantId)
    .single()
    logQueryError("sendLeaseStatement tenant_view", tenantError)

  if (!tenant?.email) return false

  const [invoices, payments, closingBalance, propertyLabel] = await Promise.all([
    buildInvoiceRows(service, ctx.leaseId, ctx.periodFrom, ctx.periodTo),
    buildPaymentRows(service, ctx.leaseId, ctx.periodFrom, ctx.periodTo),
    getClosingBalance(service, ctx.leaseId),
    buildPropertyLabel(service, ctx.unitId),
  ])

  if (!invoices || !payments) return false
  if (invoices.length === 0 && payments.length === 0) return false

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"

  const result = await routeAndSend({
    orgId:        ctx.orgId,
    tenantId:     ctx.tenantId,
    templateKey:  "rent.monthly_statement",
    to: { email: tenant.email as string, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
    subject: `Account statement — ${ctx.statementMonthLabel} — ${propertyLabel}`,
    emailElement: React.createElement(MonthlyStatementEmail, {
      branding:              ctx.branding,
      tenantName,
      propertyLabel,
      statementMonth:        ctx.statementMonthLabel,
      invoices,
      payments,
      closingBalanceDisplay: fmt(closingBalance),
      senderName:            ctx.senderName,
    }),
    entityType:       "lease",
    entityId:         ctx.leaseId,
    triggerEventType: "cron:monthly_statement",
    triggerEventId:   ctx.leaseId,
    toneVariant:      "n/a",
  })

  return result.success
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const service = await createServiceClient()
  const today = saTodayISO()
  const dayOfMonth = Number(today.slice(8, 10))

  const prevMonth = addCalendarMonths(monthStart(today), -1)
  const periodFrom = prevMonth
  const periodTo   = monthEnd(prevMonth)
  const statementMonthLabel = fmtZA(prevMonth, { month: "long", year: "numeric" })

  // The Pleks system org is not a customer (010 §50; lib/comms/platform-org.ts) — exclude it so this
  // loop never treats it as an agency.
  const { data: orgs, error: orgError } = await service
    .from("organisations").select("id, name, settings").eq("is_platform", false)
  if (orgError) {
    console.error("[monthly-statement] org query failed:", orgError.message)
    return Response.json({ ok: false, error: orgError.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const org of orgs ?? []) {
    if (getStatementDay(org.settings as Record<string, unknown> | null) !== dayOfMonth) {
      skipped++
      continue
    }

    const { data: leases, error: leasesError } = await service
      .from("leases")
      .select("id, tenant_id, unit_id")
      .eq("org_id", org.id)
      .in("status", ["active", "month_to_month", "notice"])

    if (leasesError) {
      console.error("[monthly-statement] leases query failed for org", org.id, leasesError.message)
      continue
    }

    const orgSettings = await fetchOrgSettings(org.id as string)
    const branding = buildBranding(orgSettings)
    const senderName = orgSettings?.name ?? (org.name as string)

    for (const lease of leases ?? []) {
      try {
        const ok = await sendLeaseStatement(service, {
          leaseId:             lease.id as string,
          tenantId:            lease.tenant_id as string,
          unitId:              lease.unit_id as string,
          orgId:               org.id as string,
          orgName:             org.name as string,
          branding,
          senderName,
          periodFrom,
          periodTo,
          statementMonthLabel,
        })
        if (ok) sent++
        else skipped++
      } catch (err) {
        console.error("[monthly-statement] lease", lease.id, "failed:", err)
        skipped++
      }
    }
  }

  return Response.json({ ok: true, day: dayOfMonth, period: `${periodFrom}/${periodTo}`, sent, skipped })
}
