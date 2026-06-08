"use server"

/**
 * lib/actions/inspections.ts — inspection lifecycle server actions
 *
 * Auth:   gateway (agent session required)
 * Data:   inspections, inspection_items, unit_inspection_profiles, tenant_view,
 *         units, properties via gateway
 * Notes:  I1 fires on createInspection when tenant_id and scheduled_date are set (before redirect).
 *         I3 fires on rescheduleInspection when tenant_id is set.
 *         I4/I5/I6 fire on updateInspectionStatus on transition to awaiting_tenant_review.
 *         BUILD_63 Phase 4.
 */

import * as React from "react"
import { SupabaseClient } from "@supabase/supabase-js"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { seedInspectionRooms } from "@/lib/inspections/seedRooms"
import { saveProfileFromInspection } from "@/lib/inspections/profileHelpers"
import { InspectionScheduledEmail } from "@/lib/comms/templates/tenant/inspections/inspection-scheduled"
import { InspectionRescheduledEmail } from "@/lib/comms/templates/tenant/inspections/inspection-rescheduled"
import { InspectionMoveInReportEmail } from "@/lib/comms/templates/tenant/inspections/inspection-move-in-report"
import { InspectionReportReadyEmail } from "@/lib/comms/templates/tenant/inspections/inspection-report-ready"
import { InspectionDisputeWindowEmail } from "@/lib/comms/templates/tenant/inspections/inspection-dispute-window"

const PROFILE_REQUIRED_TYPES = new Set(["move_in", "move_out", "periodic"])

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  move_in:     "Move-in Inspection",
  move_out:    "Move-out Inspection",
  periodic:    "Periodic Inspection",
  pre_listing: "Pre-listing Inspection",
}

function formatDateLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

/** Log-only Supabase error guard (loud-not-fatal); a call keeps cognitive complexity flat vs inline `if`. */
function logErr(label: string, error: { message: string } | null) {
  if (error) console.error(`${label}:`, error.message)
}

type StatusCommArgs = {
  orgId: string
  tenantId: string
  unitId: string | null
  inspectionType: string
  conductedDateFromRow: string | null
}

async function fireStatusComm(
  db: SupabaseClient,
  inspectionId: string,
  args: StatusCommArgs,
  updates: Record<string, unknown>,
  isAwaitingReview: boolean,
  isCommercialCompleted: boolean,
): Promise<void> {
  const { orgId, tenantId, unitId, inspectionType, conductedDateFromRow } = args

  const { data: tenant, error: tenantError } = await db
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", tenantId)
    .single()

  if (tenantError) console.error("fireStatusComm tenant_view read failed:", tenantError.message)
  if (!(tenant?.email ?? tenant?.phone)) return

  let propertyLabel = "your property"
  if (unitId) {
    const { data: unitRow, error: unitRowError } = await db
      .from("units")
      .select("unit_number, properties(address_line1, suburb, city)")
      .eq("id", unitId)
      .maybeSingle()

    if (unitRowError) console.error("fireStatusComm units read failed:", unitRowError.message)
    type PropRow = { address_line1: string; suburb: string | null; city: string }
    type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
    const unitData = unitRow as unknown as UnitRow | null
    const rawProps = unitData?.properties ?? null
    const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
    if (propData) {
      propertyLabel = [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
    }
  }

  const orgSettings = await fetchOrgSettings(orgId)
  const branding = buildBranding(orgSettings)
  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const senderName = orgSettings?.name ?? branding.orgName
  const inspectionTypeLabel = INSPECTION_TYPE_LABELS[inspectionType] ?? "Inspection"
  const conductedDateRaw = (updates.conducted_date as string | undefined) ?? conductedDateFromRow ?? null
  const conductedDate = conductedDateRaw ? formatDateLocal(conductedDateRaw) : ""
  const refNum = inspectionId.slice(0, 8).toUpperCase()
  const toParams = {
    email: (tenant.email as string | null) ?? undefined,
    phone: (tenant.phone as string | null) ?? undefined,
    name: tenantName,
  }

  if (isAwaitingReview && inspectionType === "move_in") {
    // I4: mandatory move-in report (RHA s5(3)(e))
    await routeAndSend({
      orgId, tenantId, templateKey: "inspection.move_in_report", to: toParams,
      subject:      `Move-in Inspection Report — ${propertyLabel} — Ref ${refNum}`,
      emailElement: React.createElement(InspectionMoveInReportEmail, { branding, tenantName, propertyLabel, conductedDate, referenceNumber: refNum }),
      entityType: "inspection", entityId: inspectionId, triggerEventType: "inspection_move_in_report", triggerEventId: inspectionId, toneVariant: "n/a",
    })
  } else if ((isAwaitingReview && inspectionType === "periodic") || isCommercialCompleted) {
    // I5: report ready (periodic residential or commercial completed)
    await routeAndSend({
      orgId, tenantId, templateKey: "inspection.report_ready", to: toParams,
      subject:      `${inspectionTypeLabel} Report Available — ${propertyLabel}`,
      emailElement: React.createElement(InspectionReportReadyEmail, { branding, tenantName, propertyLabel, inspectionTypeLabel, conductedDate, senderName }),
      entityType: "inspection", entityId: inspectionId, triggerEventType: "inspection_report_ready", triggerEventId: inspectionId, toneVariant: "n/a",
    })
  } else if (isAwaitingReview && inspectionType === "move_out") {
    // I6: mandatory move-out dispute window (RHA s5(3)(g))
    await routeAndSend({
      orgId, tenantId, templateKey: "inspection.dispute_window", to: toParams,
      subject:      `Move-out Inspection — Dispute Window Notice — Ref ${refNum}`,
      emailElement: React.createElement(InspectionDisputeWindowEmail, { branding, tenantName, propertyLabel, conductedDate, disputeWindowClosesAt: formatDateLocal(updates.dispute_window_closes_at as string), referenceNumber: refNum }),
      entityType: "inspection", entityId: inspectionId, triggerEventType: "inspection_dispute_window", triggerEventId: inspectionId, toneVariant: "n/a",
    })
  }
}

export async function createInspection(formData: FormData) {
  const gw = await requireAgentWriteAccess("sign_off_inspection")
  const { db, userId, orgId } = gw

  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const leaseId = formData.get("lease_id") as string || null
  const tenantId = formData.get("tenant_id") as string || null
  const inspectionType = formData.get("inspection_type") as string
  const leaseType = formData.get("lease_type") as string || "residential"
  const scheduledDate = formData.get("scheduled_date") as string || null

  // Hard gate: move_in / move_out / periodic require an existing profile
  if (PROFILE_REQUIRED_TYPES.has(inspectionType) && leaseType === "residential") {
    const { count, error: profileCheckErr } = await db
      .from("unit_inspection_profiles")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)

    if (profileCheckErr) {
      console.error("createInspection profile check:", profileCheckErr.message)
    }

    if ((count ?? 0) === 0) {
      return { error: "no_profile" }
    }
  }

  const { data: inspection, error } = await db
    .from("inspections")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: propertyId,
      lease_id: leaseId,
      tenant_id: tenantId,
      inspection_type: inspectionType,
      lease_type: leaseType,
      scheduled_date: scheduledDate,
      status: "scheduled",
      conducted_by: userId,
      // Default-on-create = the creating agent (ADDENDUM_TEAMS D-12) → lands in their My-work.
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !inspection) {
    return { error: error?.message || "Failed to create inspection" }
  }

  // Seed rooms — pass unitId so the engine uses profile-first logic
  await seedInspectionRooms(db, inspection.id, orgId, leaseType, unitId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "inspections",
    record_id: inspection.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { inspection_type: inspectionType, lease_type: leaseType, unit_id: unitId },
  })

  // I1: notify tenant of scheduled inspection
  if (tenantId && scheduledDate) {
    try {
      const { data: tenant, error: tenantError } = await db
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", tenantId)
        .single()

      if (tenantError) console.error("createInspection I1 tenant_view read failed:", tenantError.message)
      if (tenant?.email ?? tenant?.phone) {
        const { data: unitRow, error: unitRowError } = await db
          .from("units")
          .select("unit_number, properties(address_line1, suburb, city)")
          .eq("id", unitId)
          .maybeSingle()

        if (unitRowError) console.error("createInspection I1 units read failed:", unitRowError.message)

        type PropRow = { address_line1: string; suburb: string | null; city: string }
        type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
        const unitData = unitRow as unknown as UnitRow | null
        const rawProps = unitData?.properties ?? null
        const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
        const propertyLabel = propData
          ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
          : "your property"

        const orgSettings = await fetchOrgSettings(orgId)
        const branding = buildBranding(orgSettings)
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const senderName = orgSettings?.name ?? branding.orgName
        const inspectionTypeLabel = INSPECTION_TYPE_LABELS[inspectionType] ?? "Inspection"
        const scheduledDateDisplay = formatDateLocal(scheduledDate)

        await routeAndSend({
          orgId,
          tenantId,
          templateKey: "inspection.scheduled",
          to: {
            email: (tenant.email as string | null) ?? undefined,
            phone: (tenant.phone as string | null) ?? undefined,
            name: tenantName,
          },
          subject: `${inspectionTypeLabel} Scheduled — ${propertyLabel} — ${scheduledDateDisplay}`,
          emailElement: React.createElement(InspectionScheduledEmail, {
            branding,
            tenantName,
            propertyLabel,
            inspectionTypeLabel,
            scheduledDate: scheduledDateDisplay,
            senderName,
          }),
          entityType:       "inspection",
          entityId:         inspection.id,
          triggerEventType: "inspection_scheduled",
          triggerEventId:   inspection.id,
          toneVariant:      "n/a",
        })
      }
    } catch (err) {
      console.error("[createInspection] I1 comm failed:", err)
    }
  }

  revalidatePath("/inspections")
  redirect(`/inspections/${inspection.id}`)
}

export async function updateInspectionStatus(inspectionId: string, newStatus: string) {
  const gw = await requireAgentWriteAccess("sign_off_inspection")
  const { db, userId } = gw

  const { data: inspection, error: inspectionError } = await db
    .from("inspections")
    .select("org_id, lease_type, status, inspection_type, unit_id, tenant_id, conducted_date")
    .eq("id", inspectionId)
    .single()

  if (inspectionError) console.error("updateInspectionStatus inspections read failed:", inspectionError.message)
  if (!inspection) return { error: "Inspection not found" }

  const updates: Record<string, unknown> = { status: newStatus }

  // Residential non-pre_listing → open dispute window instead of going straight to completed
  if (
    newStatus === "completed" &&
    inspection.lease_type === "residential" &&
    inspection.inspection_type !== "pre_listing"
  ) {
    const now = new Date()
    const closeDate = new Date(now)
    closeDate.setDate(closeDate.getDate() + 7)
    updates.status = "awaiting_tenant_review"
    updates.conducted_date = now.toISOString()
    updates.dispute_window_open = true
    updates.dispute_window_opened_at = now.toISOString()
    updates.dispute_window_closes_at = closeDate.toISOString()
  }

  if (newStatus === "completed" && inspection.lease_type === "commercial") {
    updates.conducted_date = new Date().toISOString()
  }

  if (newStatus === "in_progress") {
    updates.conducted_date = new Date().toISOString()
    // Lazy seed: covers inspections created outside createInspection()
    await seedInspectionRooms(
      db,
      inspectionId,
      inspection.org_id,
      inspection.lease_type ?? "residential",
      inspection.unit_id ?? undefined,
    )
  }

  await db.from("inspections").update(updates).eq("id", inspectionId)

  // Pre-listing completion: save the inspector's room list as the unit's profile
  if (newStatus === "completed" && inspection.inspection_type === "pre_listing" && inspection.unit_id) {
    await saveProfileFromInspection(db, inspectionId, inspection.unit_id, inspection.org_id)
  }

  await db.from("audit_log").insert({
    org_id: inspection.org_id,
    table_name: "inspections",
    record_id: inspectionId,
    action: "UPDATE",
    changed_by: userId,
    new_values: updates,
  })

  // I4/I5/I6: fire lifecycle comms on awaiting_tenant_review or commercial completed
  const effectiveStatus = (updates.status as string | undefined) ?? newStatus
  const isAwaitingReview = effectiveStatus === "awaiting_tenant_review"
  const isCommercialCompleted = newStatus === "completed" && inspection.lease_type === "commercial"

  if (inspection.tenant_id && (isAwaitingReview || isCommercialCompleted)) {
    try {
      await fireStatusComm(db, inspectionId, {
        orgId:               inspection.org_id as string,
        tenantId:            inspection.tenant_id as string,
        unitId:              (inspection.unit_id as string | null) ?? null,
        inspectionType:      inspection.inspection_type as string,
        conductedDateFromRow: (inspection.conducted_date as string | null) ?? null,
      }, updates, isAwaitingReview, isCommercialCompleted)
    } catch (err) {
      console.error("[updateInspectionStatus] comm failed:", err)
    }
  }

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}

export async function updateItemCondition(
  itemId: string,
  inspectionId: string,
  condition: string,
  notes?: string
): Promise<{ success: true; error?: never } | { success?: never; error: string }> {
  const gw = await requireAgentWriteAccess("sign_off_inspection")
  const { db } = gw

  const { error } = await db.from("inspection_items").update({
    condition,
    condition_notes: notes || null,
  }).eq("id", itemId)

  if (error) return { error: error.message }

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}

export async function rescheduleInspection(
  inspectionId: string,
  newDate: string,
  rescheduleReason?: string | null,
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("sign_off_inspection")
  const { db, userId, orgId } = gw

  const { data: inspection, error: inspectionError } = await db
    .from("inspections")
    .select("org_id, tenant_id, unit_id, inspection_type, lease_type, scheduled_date, status")
    .eq("id", inspectionId)
    .eq("org_id", orgId)
    .single()

  if (inspectionError) console.error("rescheduleInspection inspections read failed:", inspectionError.message)
  if (!inspection) return { error: "Inspection not found" }

  const originalDate = inspection.scheduled_date
    ? formatDateLocal(inspection.scheduled_date as string)
    : ""

  const { error: updateErr } = await db
    .from("inspections")
    .update({ scheduled_date: newDate })
    .eq("id", inspectionId)

  if (updateErr) return { error: updateErr.message }

  await db.from("audit_log").insert({
    org_id: inspection.org_id,
    table_name: "inspections",
    record_id: inspectionId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { scheduled_date: newDate },
  })

  // I3: notify tenant of reschedule
  if (inspection.tenant_id) {
    try {
      const { data: tenant, error: tenantError } = await db
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", inspection.tenant_id)
        .single()

      logErr("rescheduleInspection tenant_view read failed", tenantError)
      if (tenant?.email ?? tenant?.phone) {
        let propertyLabel = "your property"
        if (inspection.unit_id) {
          const { data: unitRow, error: unitRowError } = await db
            .from("units")
            .select("unit_number, properties(address_line1, suburb, city)")
            .eq("id", inspection.unit_id)
            .maybeSingle()

          logErr("rescheduleInspection units read failed", unitRowError)

          type PropRow = { address_line1: string; suburb: string | null; city: string }
          type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
          const unitData = unitRow as unknown as UnitRow | null
          const rawProps = unitData?.properties ?? null
          const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
          if (propData) {
            propertyLabel = [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
          }
        }

        const orgSettings = await fetchOrgSettings(inspection.org_id as string)
        const branding = buildBranding(orgSettings)
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const senderName = orgSettings?.name ?? branding.orgName
        const inspectionTypeLabel = INSPECTION_TYPE_LABELS[inspection.inspection_type as string] ?? "Inspection"
        const newDateDisplay = formatDateLocal(newDate)

        await routeAndSend({
          orgId:       inspection.org_id as string,
          tenantId:    inspection.tenant_id as string,
          templateKey: "inspection.rescheduled",
          to: {
            email: (tenant.email as string | null) ?? undefined,
            phone: (tenant.phone as string | null) ?? undefined,
            name: tenantName,
          },
          subject:      `${inspectionTypeLabel} Rescheduled — ${propertyLabel} — New date: ${newDateDisplay}`,
          emailElement: React.createElement(InspectionRescheduledEmail, {
            branding,
            tenantName,
            propertyLabel,
            inspectionTypeLabel,
            originalDate,
            newDate: newDateDisplay,
            rescheduleReason,
            senderName,
          }),
          entityType:       "inspection",
          entityId:         inspectionId,
          triggerEventType: "inspection_rescheduled",
          triggerEventId:   inspectionId,
          toneVariant:      "n/a",
        })
      }
    } catch (err) {
      console.error("[rescheduleInspection] I3 comm failed:", err)
    }
  }

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}
