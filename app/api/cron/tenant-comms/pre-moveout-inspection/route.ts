/**
 * app/api/cron/tenant-comms/pre-moveout-inspection/route.ts — pre-move-out inspection reminder
 *
 * Route:  GET /api/cron/tenant-comms/pre-moveout-inspection
 * Auth:   x-cron-secret header — called by daily orchestrator
 * Data:   leases, tenant_view, communication_log (frequency limiter) via service client
 * Notes:  Scans leases ending in exactly 15 days and fires deposit.pre_moveout_inspection.
 *         Frequency limiter ensures one send per tenant per topic per 48h, so re-running
 *         the cron is safe. BUILD_63 Phase 3 (D1).
 */

import * as React from "react"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import {
  DepositPreMoveoutEmail,
  buildPreMoveoutSms,
} from "@/lib/comms/templates/tenant/deposits/deposit-pre-moveout"

const DAYS_BEFORE = 15

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const today = new Date()

  // Target: leases whose end_date is exactly DAYS_BEFORE days from today
  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + DAYS_BEFORE)
  const targetDateStr = targetDate.toISOString().split("T")[0]

  const { data: leases, error } = await service
    .from("leases")
    .select("id, org_id, tenant_id, end_date")
    .eq("end_date", targetDateStr)
    .in("status", ["active", "notice"])

  if (error) {
    console.error("[pre-moveout-inspection] query failed:", error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const lease of leases ?? []) {
    try {
      const { data: tenant } = await service
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", lease.tenant_id)
        .single()

      if (!tenant?.email && !tenant?.phone) { skipped++; continue }

      // Fetch property label
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
      const leaseEndDisplay = new Date(lease.end_date as string).toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric",
      })
      const senderName = orgSettings?.name ?? branding.orgName

      const result = await routeAndSend({
        orgId:     lease.org_id as string,
        tenantId:  lease.tenant_id as string,
        templateKey: "deposit.pre_moveout_inspection",
        to: {
          email: tenant.email ?? undefined,
          phone: (tenant.phone as string | null) ?? undefined,
          name: tenantName,
        },
        subject: `Move-out approaching — ${DAYS_BEFORE} days remaining — ${propertyLabel}`,
        emailElement: React.createElement(DepositPreMoveoutEmail, {
          branding,
          tenantName,
          propertyLabel,
          leaseEndDate:    leaseEndDisplay,
          daysRemaining:   DAYS_BEFORE,
          senderName,
        }),
        smsBody: buildPreMoveoutSms(
          (tenant.first_name as string | null) ?? "Tenant",
          propertyLabel,
          leaseEndDisplay,
          senderName,
        ),
        entityType:       "lease",
        entityId:         lease.id as string,
        triggerEventType: "cron:pre_moveout_inspection",
        triggerEventId:   lease.id as string,
        toneVariant:      "n/a",
      })

      if (result.success) sent++
      else skipped++
    } catch (err) {
      console.error("[pre-moveout-inspection] lease", lease.id, "failed:", err)
      skipped++
    }
  }

  return Response.json({ ok: true, target_date: targetDateStr, sent, skipped })
}
