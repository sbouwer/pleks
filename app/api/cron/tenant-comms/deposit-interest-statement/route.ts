/**
 * app/api/cron/tenant-comms/deposit-interest-statement/route.ts — annual deposit interest statement
 *
 * Route:  GET /api/cron/tenant-comms/deposit-interest-statement
 * Auth:   x-cron-secret header — called by daily orchestrator on the 1st of each month
 * Data:   leases, deposit_transactions, tenant_view via service client
 * Notes:  Fires deposit.interest_statement once per year for each active lease whose
 *         start_date falls in the current month (anniversary-month trigger).
 *         Frequency limiter guards against double-sends. BUILD_63 Phase 3 (F5).
 *         Move-out trigger is handled separately in the lease termination flow (Phase 5).
 */

import * as React from "react"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { DepositInterestStatementEmail } from "@/lib/comms/templates/tenant/deposits/deposit-interest-statement"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

type Svc = Awaited<ReturnType<typeof createServiceClient>>
interface DepositLease { id: string; org_id: string; tenant_id: string; start_date: string; deposit_amount_cents: number; deposit_interest_rate_percent: number | null }

const fmtR = (cents: number) => "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
const fmtDate = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

async function resolvePropertyLabel(service: Svc, leaseId: string): Promise<string> {
  const { data: unitRow, error } = await service
    .from("leases").select("units(unit_number, properties(address_line1, suburb, city))").eq("id", leaseId).maybeSingle()
  logQueryError("deposit-interest property label", error)
  type PropRow = { address_line1: string; suburb: string | null; city: string }
  type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
  const unitRaw = (unitRow as unknown as { units: UnitRow | UnitRow[] | null } | null)?.units
  const unitData = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw
  const rawProps = unitData?.properties ?? null
  const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
  if (!propData) return "your property"
  return [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
}

/** Process one anniversary lease. Returns true if a statement was sent, false if skipped (incl. the
 *  idempotency guard). Extracted to keep GET under the cognitive-complexity limit. */
async function sendDepositInterestStatement(service: Svc, lease: DepositLease, today: Date, currentMonth: number, currentYear: number): Promise<boolean> {
  if (new Date(lease.start_date).getFullYear() >= currentYear) return false   // not yet one year old

  const { data: tenant, error: tenantError } = await service
    .from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single()
  logQueryError("deposit-interest tenant_view", tenantError)
  if (!tenant?.email) return false

  // Idempotency (replay/double-send guard): an annual anniversary statement — one send per lease per
  // anniversary month. A same-month re-fire (cPanel retry, manual re-run) must not re-send. Same
  // check-before-write the monthly-statement + invoice crons carry.
  const cycleStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`
  const { data: alreadySent, error: dupError } = await service
    .from("communication_log").select("id")
    .eq("entity_type", "lease").eq("entity_id", lease.id)
    // M-2 (comms audit): only a SUCCESSFUL prior send blocks — a failed one must not suppress the retry.
    .eq("template_key", "deposit.interest_statement").eq("status", "sent").gte("created_at", cycleStart).limit(1)
  logQueryError("deposit-interest-statement dedupe", dupError)
  if (alreadySent && alreadySent.length > 0) return false

  const periodTo = new Date(today)
  const periodFrom = new Date(today); periodFrom.setFullYear(periodFrom.getFullYear() - 1)

  const { data: interestTxns, error: interestTxnsError } = await service
    .from("deposit_transactions").select("amount_cents, effective_rate_percent")
    .eq("lease_id", lease.id).eq("transaction_type", "interest_accrued")
    .gte("created_at", periodFrom.toISOString().split("T")[0]).lte("created_at", periodTo.toISOString().split("T")[0])
  logQueryError("deposit-interest txns period", interestTxnsError)
  const interestThisPeriod = (interestTxns ?? []).reduce((s, t) => s + (t.amount_cents as number), 0)

  const { data: allInterest, error: allInterestError } = await service
    .from("deposit_transactions").select("amount_cents").eq("lease_id", lease.id).eq("transaction_type", "interest_accrued")
  logQueryError("deposit-interest txns all", allInterestError)
  const cumulativeInterest = (allInterest ?? []).reduce((s, t) => s + (t.amount_cents as number), 0)

  const lastTxn = interestTxns?.at(-1)
  const effectiveRate = (lastTxn?.effective_rate_percent as number | null) ?? lease.deposit_interest_rate_percent ?? 0

  const propertyLabel = await resolvePropertyLabel(service, lease.id)
  const orgSettings = await fetchOrgSettings(lease.org_id)
  const branding = buildBranding(orgSettings)
  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"

  const result = await routeAndSend({
    orgId: lease.org_id, tenantId: lease.tenant_id, templateKey: "deposit.interest_statement",
    to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
    subject: `Deposit interest statement — ${fmtDate(periodFrom)} to ${fmtDate(periodTo)}`,
    emailElement: React.createElement(DepositInterestStatementEmail, {
      branding, tenantName, propertyLabel, periodFrom: fmtDate(periodFrom), periodTo: fmtDate(periodTo),
      depositHeldDisplay: fmtR(lease.deposit_amount_cents), interestThisPeriodDisplay: fmtR(interestThisPeriod),
      cumulativeInterestDisplay: fmtR(cumulativeInterest), effectiveRateDisplay: `${effectiveRate.toFixed(2)}%`,
      senderName: orgSettings?.name ?? branding.orgName,
    }),
    entityType: "lease", entityId: lease.id, triggerEventType: "cron:deposit_interest_statement",
    triggerEventId: lease.id, toneVariant: "n/a",
  })
  return result.success
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const service = await createServiceClient()
  const today = new Date()
  const currentMonth = today.getMonth() + 1  // 1–12
  const currentYear  = today.getFullYear()

  // Fetch all active leases with deposits, filter anniversary month in JS
  const { data: allLeases, error } = await service
    .from("leases")
    .select("id, org_id, tenant_id, start_date, deposit_amount_cents, deposit_interest_rate_percent")
    .in("status", ["active", "notice"])
    .gt("deposit_amount_cents", 0)

  if (error) {
    console.error("[deposit-interest-statement] query failed:", error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Filter to leases whose start_date month matches the current month (anniversary trigger)
  const leases = (allLeases ?? []).filter((l) => {
    const startMonth = new Date(l.start_date as string).getMonth() + 1 // 1–12
    return startMonth === currentMonth
  })

  let sent = 0
  let skipped = 0

  for (const lease of leases ?? []) {
    try {
      if (await sendDepositInterestStatement(service, lease as unknown as DepositLease, today, currentMonth, currentYear)) sent++
      else skipped++
    } catch (err) {
      console.error("[deposit-interest-statement] lease", lease.id, "failed:", err)
      skipped++
    }
  }

  return Response.json({ ok: true, month: currentMonth, year: currentYear, sent, skipped })
}
