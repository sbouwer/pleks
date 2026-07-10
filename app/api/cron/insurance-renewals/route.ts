/**
 * GET /api/cron/insurance-renewals
 *
 * Daily cron — two responsibilities:
 *   1. Renewal reset: on a property's insurance_renewal_date, flip all confirmed
 *      checklist items back to 'unknown'. Auto-derived items (POLICY_HEADER)
 *      are re-evaluated instead of flipped. Writes renewal_reset_at on each row.
 *   2. T+7 reminder: seven days after renewal reset, send one email to the
 *      agency if any items are still unknown. Locked via
 *      property_insurance_renewal_reminders to prevent repeat sends.
 *
 * Wired into the main daily cron at /api/cron/daily.
 */

import * as React from "react"
import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { RenewalReminderEmail } from "@/lib/comms/templates/insurance/renewal-reminder"
import { requireCronAuth } from "@/lib/cron/auth"
import { addCalendarDays, fmtDateLongZA, saTodayISO } from "@/lib/dates"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Db = ReturnType<typeof getServiceClient>

// ── Health tracking ───────────────────────────────────────────────────────────

async function startJob(db: Db): Promise<string | null> {
  const { data, error } = await db.from("cron_runs").insert({
    job_name:   "insurance-renewals",
    started_at: new Date().toISOString(),
    status:     "running",
  }).select("id").single()
  if (error) console.error("insurance-renewals cron_runs insert failed:", error.message)
  return (data?.id as string) ?? null
}

async function finishJob(
  db: Db,
  id: string | null,
  status: "completed" | "failed",
  rowsProcessed: number,
  errorMessage?: string,
): Promise<void> {
  if (!id) return
  await db.from("cron_runs")
    .update({
      finished_at:    new Date().toISOString(),
      status,
      rows_processed: rowsProcessed,
      error_message:  errorMessage ?? null,
    })
    .eq("id", id)
}

// ── Renewal reset ─────────────────────────────────────────────────────────────

async function resetPropertyChecklist(db: Db, propertyId: string, renewalDate: string): Promise<number> {
  const { data: items, error: itemsError } = await db
    .from("property_insurance_checklists")
    .select("id, item_code, state, insurance_checklist_items(is_auto_derived)")
    .eq("property_id", propertyId)
    .eq("state", "confirmed")
  if (itemsError) console.error("resetPropertyChecklist property_insurance_checklists read failed:", itemsError.message)

  let resetCount = 0
  const now = new Date().toISOString()

  for (const item of items ?? []) {
    const isAutoDerived = (item.insurance_checklist_items as unknown as { is_auto_derived: boolean } | null)?.is_auto_derived ?? false

    if (isAutoDerived) {
      // Re-evaluate POLICY_HEADER: check if all 6 insurance fields are still populated
      const { data: prop, error: propError } = await db
        .from("properties")
        .select("insurance_provider, insurance_policy_number, insurance_policy_type, insurance_renewal_date, insurance_replacement_value_cents, insurance_excess_cents")
        .eq("id", propertyId)
        .single()
      if (propError) console.error("resetPropertyChecklist properties read failed:", propError.message)

      const allPresent = prop &&
        !!((prop.insurance_provider as string | null)?.trim()) &&
        !!((prop.insurance_policy_number as string | null)?.trim()) &&
        prop.insurance_policy_type &&
        prop.insurance_renewal_date &&
        prop.insurance_replacement_value_cents !== null &&
        prop.insurance_excess_cents !== null

      if (!allPresent) {
        await db.from("property_insurance_checklists")
          .update({ state: "unknown", confirmed_at: null, confirmed_by: null, confirmed_via: null, renewal_reset_at: now })
          .eq("id", item.id)
        await db.from("property_insurance_checklist_events").insert({
          checklist_id: item.id, event_type: "renewal_reset",
          prior_state: "confirmed", new_state: "unknown",
          source: "cron", payload: { renewal_date: renewalDate },
        })
        resetCount++
      }
      continue
    }

    await db.from("property_insurance_checklists")
      .update({ state: "unknown", confirmed_at: null, confirmed_by: null, confirmed_via: null, renewal_reset_at: now })
      .eq("id", item.id)

    await db.from("property_insurance_checklist_events").insert({
      checklist_id: item.id, event_type: "renewal_reset",
      prior_state: "confirmed", new_state: "unknown",
      source: "cron", payload: { renewal_date: renewalDate },
    })
    resetCount++
  }

  return resetCount
}

// ── T+7 reminder ──────────────────────────────────────────────────────────────

async function sendRenewalReminder(db: Db, propertyId: string, orgId: string, renewalDate: string): Promise<void> {
  // Check if reminder already sent for this renewal cycle
  const { data: existing, error: existingError } = await db
    .from("property_insurance_renewal_reminders")
    .select("renewal_date")
    .eq("property_id", propertyId)
    .single()
  if (existingError) console.error("sendRenewalReminder reminders read failed:", existingError.message)

  if (existing?.renewal_date === renewalDate) return  // already sent

  // Count still-unknown items
  const { count } = await db
    .from("property_insurance_checklists")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("state", "unknown")

  if (!count || count === 0) return  // all verified, no reminder needed

  // Property label
  const { data: prop, error: propLabelError } = await db
    .from("properties")
    .select("name, address_line1, suburb, city")
    .eq("id", propertyId)
    .single()
  if (propLabelError) console.error("sendRenewalReminder properties read failed:", propLabelError.message)

  const propertyLabel = (prop?.name as string | null) ?? "your property"
  const address = [prop?.address_line1, prop?.suburb, prop?.city].filter(Boolean).join(", ")
  const propertyDisplay = address ? `${propertyLabel} — ${address}` : propertyLabel

  // Recipient: first admin user in org
  const { data: agentRow, error: agentRowError } = await db
    .from("user_orgs")
    .select("user_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle()
  if (agentRowError) console.error("sendRenewalReminder user_orgs read failed:", agentRowError.message)

  if (!agentRow?.user_id) return

  const { data: authUser } = await db.auth.admin.getUserById(agentRow.user_id as string)
  const agentEmail = authUser?.user?.email
  if (!agentEmail) return

  const renewalFormatted = fmtDateLongZA(renewalDate)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://app.pleks.co.za"
  const checklistUrl = `${baseUrl}/properties/${propertyId}?tab=insurance`

  const orgSettings = await fetchOrgSettings(orgId)
  const branding    = buildBranding(orgSettings)

  const emailElement = React.createElement(RenewalReminderEmail, {
    branding,
    propertyDisplay,
    renewalDateFormatted: renewalFormatted,
    unknownCount: count,
    checklistUrl,
  })

  const result = await sendEmail({
    orgId,
    templateKey: "insurance.renewal_reminder",
    to: { email: agentEmail, name: agentEmail },
    subject: `Insurance renewed — ${count} checklist item${count === 1 ? "" : "s"} still outstanding`,
    emailElement,
    bodyPreview: `Insurance policy for ${propertyDisplay} renewed on ${renewalFormatted}. ${count} items still outstanding.`,
    entityType: "property",
    entityId:   propertyId,
  })

  // Record reminder sent — upsert so next year's renewal replaces this row
  await db.from("property_insurance_renewal_reminders").upsert({
    property_id:    propertyId,
    org_id:         orgId,
    renewal_date:   renewalDate,
    reminded_at:    new Date().toISOString(),
    comm_log_id:    result.logId ?? null,
  }, { onConflict: "property_id" })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const db = getServiceClient()
  const runId = await startJob(db)

  try {
    const today = saTodayISO()
    const sevenDaysAgo = addCalendarDays(saTodayISO(), -7)
    const sixDaysAgo = addCalendarDays(saTodayISO(), -6)

    // 1. Find properties whose renewal date is today → reset checklist
    const { data: dueToday, error: dueTodayError } = await db
      .from("properties")
      .select("id, org_id, insurance_renewal_date")
      .eq("insurance_renewal_date", today)
      .is("deleted_at", null)
    if (dueTodayError) console.error("insurance-renewals dueToday properties read failed:", dueTodayError.message)

    let resetTotal = 0
    for (const prop of dueToday ?? []) {
      const count = await resetPropertyChecklist(db, prop.id as string, today)
      resetTotal += count
    }

    // 2. Find properties where renewal was 7 days ago and items still unknown
    const { data: needReminder, error: needReminderError } = await db
      .from("property_insurance_checklists")
      .select("property_id, property_insurance_checklists_properties:property_id(org_id, insurance_renewal_date)")
      .gte("renewal_reset_at", sevenDaysAgo)
      .lt("renewal_reset_at", sixDaysAgo)
      .eq("state", "unknown")
    if (needReminderError) console.error("insurance-renewals needReminder read failed:", needReminderError.message)

    const reminderPropertyIds = new Set<string>()
    for (const row of needReminder ?? []) {
      const pid = row.property_id as string
      if (!reminderPropertyIds.has(pid)) {
        reminderPropertyIds.add(pid)
        const propData = row.property_insurance_checklists_properties as unknown as { org_id: string; insurance_renewal_date: string } | null
        if (propData) {
          await sendRenewalReminder(db, pid, propData.org_id, propData.insurance_renewal_date)
        }
      }
    }

    await finishJob(db, runId, "completed", resetTotal + reminderPropertyIds.size)
    return Response.json({
      ok: true,
      reset_items: resetTotal,
      reminders_sent: reminderPropertyIds.size,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishJob(db, runId, "failed", 0, msg)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
