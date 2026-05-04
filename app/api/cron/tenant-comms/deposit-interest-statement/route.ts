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

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

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
      // Skip leases that started this year (not yet one year old)
      const leaseStartYear = new Date(lease.start_date as string).getFullYear()
      if (leaseStartYear >= currentYear) { skipped++; continue }

      const { data: tenant } = await service
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", lease.tenant_id)
        .single()

      if (!tenant?.email) { skipped++; continue }

      // Sum interest accrued in the last 12 months
      const periodTo = new Date(today)
      const periodFrom = new Date(today)
      periodFrom.setFullYear(periodFrom.getFullYear() - 1)

      const { data: interestTxns } = await service
        .from("deposit_transactions")
        .select("amount_cents, effective_rate_percent")
        .eq("lease_id", lease.id)
        .eq("transaction_type", "interest_accrued")
        .gte("transaction_date", periodFrom.toISOString().split("T")[0])
        .lte("transaction_date", periodTo.toISOString().split("T")[0])

      const interestThisPeriod = (interestTxns ?? []).reduce(
        (sum, t) => sum + (t.amount_cents as number),
        0,
      )

      // Sum all interest ever accrued (cumulative)
      const { data: allInterest } = await service
        .from("deposit_transactions")
        .select("amount_cents")
        .eq("lease_id", lease.id)
        .eq("transaction_type", "interest_accrued")

      const cumulativeInterest = (allInterest ?? []).reduce(
        (sum, t) => sum + (t.amount_cents as number),
        0,
      )

      // Use last effective rate from most recent transaction, or lease setting
      const lastTxn = interestTxns?.at(-1)
      const effectiveRate = (lastTxn?.effective_rate_percent as number | null)
        ?? (lease.deposit_interest_rate_percent as number | null)
        ?? 0

      // Property label
      const { data: unitRow } = await service
        .from("leases")
        .select("units(unit_number, properties(address_line1, suburb, city))")
        .eq("id", lease.id)
        .maybeSingle()

      type PropRow = { address_line1: string; suburb: string | null; city: string }
      type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
      const unitRaw = (unitRow as unknown as { units: UnitRow | UnitRow[] | null } | null)?.units
      const unitData = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw
      const rawProps = unitData?.properties ?? null
      const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
      const propertyLabel = propData
        ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
        : "your property"

      const orgSettings = await fetchOrgSettings(lease.org_id as string)
      const branding = buildBranding(orgSettings)
      const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
      const senderName = orgSettings?.name ?? branding.orgName

      function fmt(cents: number) {
        return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
      }
      function fmtDate(d: Date) {
        return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      }

      const result = await routeAndSend({
        orgId:     lease.org_id as string,
        tenantId:  lease.tenant_id as string,
        templateKey: "deposit.interest_statement",
        to: {
          email: tenant.email,
          phone: (tenant.phone as string | null) ?? undefined,
          name: tenantName,
        },
        subject: `Deposit interest statement — ${fmtDate(periodFrom)} to ${fmtDate(periodTo)}`,
        emailElement: React.createElement(DepositInterestStatementEmail, {
          branding,
          tenantName,
          propertyLabel,
          periodFrom:                  fmtDate(periodFrom),
          periodTo:                    fmtDate(periodTo),
          depositHeldDisplay:          fmt(lease.deposit_amount_cents as number),
          interestThisPeriodDisplay:   fmt(interestThisPeriod),
          cumulativeInterestDisplay:   fmt(cumulativeInterest),
          effectiveRateDisplay:        `${effectiveRate.toFixed(2)}%`,
          senderName,
        }),
        entityType:       "lease",
        entityId:         lease.id as string,
        triggerEventType: "cron:deposit_interest_statement",
        triggerEventId:   lease.id as string,
        toneVariant:      "n/a",
      })

      if (result.success) sent++
      else skipped++
    } catch (err) {
      console.error("[deposit-interest-statement] lease", lease.id, "failed:", err)
      skipped++
    }
  }

  return Response.json({ ok: true, month: currentMonth, year: currentYear, sent, skipped })
}
