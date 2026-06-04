/**
 * app/api/cron/tenant-comms/inspection-reminder/route.ts — T-24h inspection reminder
 *
 * Route:  GET /api/cron/tenant-comms/inspection-reminder
 * Auth:   x-cron-secret header — called by daily orchestrator
 * Data:   inspections, tenant_view, units, properties (service client); frequency limiter in router
 * Notes:  Scans inspections where scheduled_date = tomorrow and status = scheduled.
 *         Sends relational email + SMS fallback via routeAndSend. BUILD_63 Phase 4 (I2).
 */

import * as React from "react"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import {
  InspectionReminderEmail,
  buildInspectionReminderSms,
  buildInspectionReminderWhatsApp,
} from "@/lib/comms/templates/tenant/inspections/inspection-reminder"
import { logQueryError } from "@/lib/supabase/logQueryError"

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  move_in:     "Move-in Inspection",
  move_out:    "Move-out Inspection",
  periodic:    "Periodic Inspection",
  pre_listing: "Pre-listing Inspection",
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const today = new Date()

  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + 1)
  const targetDateStr = targetDate.toISOString().split("T")[0]

  const { data: inspections, error } = await service
    .from("inspections")
    .select("id, org_id, tenant_id, unit_id, inspection_type, lease_type, scheduled_date")
    .eq("scheduled_date", targetDateStr)
    .eq("status", "scheduled")
    .neq("inspection_type", "pre_listing")
    .not("tenant_id", "is", null)

  if (error) {
    console.error("[inspection-reminder] query failed:", error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const inspection of inspections ?? []) {
    try {
      const { data: tenant, error: tenantErr } = await service
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", inspection.tenant_id)
        .single()

      if (tenantErr) {
        console.error("[inspection-reminder] tenant fetch failed:", tenantErr.message)
        skipped++
        continue
      }
      if (!tenant?.email && !tenant?.phone) { skipped++; continue }

      const { data: unitRow, error: unitRowError } = await service
        .from("units")
        .select("unit_number, properties(address_line1, suburb, city)")
        .eq("id", inspection.unit_id)
        .maybeSingle()
        logQueryError("GET units", unitRowError)

      type PropRow = { address_line1: string; suburb: string | null; city: string }
      type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
      const unitData = unitRow as unknown as UnitRow | null
      const rawProps = unitData?.properties ?? null
      const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
      const propertyLabel = propData
        ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
        : "your property"

      const orgSettings = await fetchOrgSettings(inspection.org_id as string)
      const branding = buildBranding(orgSettings)
      const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
      const senderName = orgSettings?.name ?? branding.orgName
      const inspectionTypeLabel = INSPECTION_TYPE_LABELS[inspection.inspection_type as string] ?? "Inspection"
      const scheduledDateDisplay = new Date(inspection.scheduled_date as string).toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric",
      })

      const firstName = (tenant.first_name as string | null) ?? "Tenant"

      const result = await routeAndSend({
        orgId:       inspection.org_id as string,
        tenantId:    inspection.tenant_id as string,
        templateKey: "inspection.reminder",
        to: {
          email: tenant.email ?? undefined,
          phone: (tenant.phone as string | null) ?? undefined,
          name: tenantName,
        },
        subject: `Reminder: ${inspectionTypeLabel} tomorrow — ${propertyLabel}`,
        emailElement: React.createElement(InspectionReminderEmail, {
          branding,
          tenantName,
          propertyLabel,
          inspectionTypeLabel,
          scheduledDate: scheduledDateDisplay,
          senderName,
        }),
        smsBody: buildInspectionReminderSms(
          firstName,
          inspectionTypeLabel,
          propertyLabel,
          scheduledDateDisplay,
          senderName,
        ),
        whatsappTemplate: buildInspectionReminderWhatsApp(
          firstName,
          inspectionTypeLabel,
          propertyLabel,
          scheduledDateDisplay,
          senderName,
        ),
        entityType:       "inspection",
        entityId:         inspection.id as string,
        triggerEventType: "cron:inspection_reminder",
        triggerEventId:   inspection.id as string,
        toneVariant:      "n/a",
      })

      if (result.success) sent++
      else skipped++
    } catch (err) {
      console.error("[inspection-reminder] inspection", inspection.id, "failed:", err)
      skipped++
    }
  }

  return Response.json({ ok: true, target_date: targetDateStr, sent, skipped })
}
