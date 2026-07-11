/**
 * app/api/cron/lease-expiry-check/route.ts — daily lease lifecycle cron: CPA renewal, auto-convert, expiry comms
 *
 * Route:  /api/cron/lease-expiry-check
 * Auth:   x-cron-secret header
 * Data:   leases, tenant_view, organisations, audit_log, communication_log
 * Notes:  BUILD_63 Phase 5: L9 (expiry reminder T-30) and L11 (terminated/expired) added alongside
 *         existing CPA renewal notice (L8) and month-to-month auto-conversion.
 *         Each loop body is extracted to a module-level helper to keep GET under SonarJS S3776 limit.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { getOrgDisplayName } from "@/lib/org/displayName"
import { sendLeaseRenewalNotice } from "@/lib/leases/emails"
import * as React from "react"
import { routeAndSend } from "@/lib/messaging/router"
import { LeaseExpiryReminderEmail } from "@/lib/comms/templates/tenant/leases/lease-expiry-reminder"
import { LeaseTerminatedEmail } from "@/lib/comms/templates/tenant/leases/lease-terminated"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"
import { addCalendarDays, fmtDateLongZA, saTodayISO } from "@/lib/dates"
import { cpaRenewalNoticeDueSafe } from "@/lib/leases/cpaRenewal"
import { recordAudit } from "@/lib/audit/recordAudit"

type Supabase = Awaited<ReturnType<typeof createServiceClient>>

type CpaLease = {
  id: string
  org_id: string
  tenant_id: string | null
  end_date: string | null
  unit_id: string
  units: unknown
}

type ExpiryLease = {
  id: string
  org_id: string
  tenant_id: string
  end_date: string
  unit_id: string
  cpa_applies_at_signing: string | null   // 3-state TEXT ('yes'|'no'|'indeterminate') — NOT a boolean
}

type NoticeLease = {
  id: string
  org_id: string
  unit_id: string
  tenant_id: string | null
}

async function handleCpaRenewal(supabase: Supabase, lease: CpaLease): Promise<void> {
  // H-1 (comms audit 2026-07-09): stamp auto_renewal_notice_sent_at ONLY after a confirmed successful
  // send. The Demand-to-Vacate Rule 5 guard reads this column as "CPA s14(2)(b)(ii) expiry notification
  // duly given" — stamping a failed send poisons that predicate and could route a Notice 2 at a tenant who
  // was never notified. (Previously stamped up-front, before the send.)
  if (!lease.tenant_id || !lease.end_date) return

  const [{ data: tenant }, { data: org }, orgSettings] = await Promise.all([
    supabase.from("tenant_view").select("email, first_name, last_name").eq("id", lease.tenant_id).single(),
    supabase.from("organisations").select("name, type, trading_as, first_name, last_name, title, initials, email, phone, brand_accent_color").eq("id", lease.org_id).single(),
    fetchOrgSettings(lease.org_id),
  ])
  const unit = lease.units as { unit_number: string; properties: { name: string } } | null
  if (!tenant?.email) return

  const result = await sendLeaseRenewalNotice(
    { email: tenant.email, name: [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant" },
    {
      id: lease.id,
      endDate: lease.end_date,
      propertyName: unit?.properties?.name ?? "",
      unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : "Unit",
    },
    { orgId: lease.org_id, orgName: org ? getOrgDisplayName(org) : "Pleks", orgPhone: org?.phone ?? undefined, orgEmail: org?.email ?? undefined, branding: buildBranding(orgSettings) }
  ).catch((e) => { console.error("[lease-expiry-check] CPA renewal notice failed:", e instanceof Error ? e.message : String(e)); return { success: false } })

  if (!result.success) return   // failed send → leave the column null so the cron retries; never stamp "notified"

  await supabase.from("leases").update({ auto_renewal_notice_sent_at: new Date().toISOString() }).eq("id", lease.id)
  await recordAudit(supabase, { orgId: lease.org_id, table: "leases", recordId: lease.id, action: "UPDATE", after: { event: "cpa_renewal_notice_sent" } })
}

export async function handleExpiryReminder(supabase: Supabase, lease: ExpiryLease): Promise<void> {
  try {
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      supabase.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
      supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
      fetchOrgSettings(lease.org_id),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    if (!tenant?.email) return

    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    const endDateDisplay = fmtDateLongZA(lease.end_date)
    const daysRemaining = Math.ceil((new Date(lease.end_date).getTime() - Date.now()) / 86_400_000)

    const result = await routeAndSend({
      orgId: lease.org_id,
      tenantId: lease.tenant_id,
      templateKey: "lease.expiry_reminder",
      to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
      subject: `Your lease expires in ${daysRemaining} days - ${propertyLabel}`,
      emailElement: React.createElement(LeaseExpiryReminderEmail, {
        branding: buildBranding(orgSettings),
        tenantName,
        propertyLabel,
        leaseEndDate: endDateDisplay,
        daysRemaining,
        senderName: orgSettings?.name ?? "Pleks",
        // F-1 #10: this cron fires for ALL fixed-term leases (not CPA-filtered), so the notice basis must
        // reflect each lease's own snapshot — not a blanket default. cpa_applies_at_signing is 3-state TEXT
        // ('yes'|'no'|'indeterminate'); only an explicit 'yes' takes the CPA branch (passing the raw string
        // let truthy 'no'/'indeterminate' mis-cite CPA s14(2)(d) on leases the CPA does not govern).
        cpaApplies: lease.cpa_applies_at_signing === "yes",
      }),
      entityType: "lease",
      entityId: lease.id,
      triggerEventType: "cron:lease-expiry-check",
      triggerEventId: lease.id,
      toneVariant: "n/a",
    })
    // H-1 (comms audit): stamp ONLY on a successful send. routeAndSend returns {success:false} (it does not
    // throw), so an unchecked stamp marked leases "notified" during the June outage — poisoning the same
    // predicate the Demand-to-Vacate Rule 5 guard reads. A failed send leaves the column null → the cron retries.
    if (result.success) {
      await supabase.from("leases").update({ expiry_reminder_sent_at: new Date().toISOString() }).eq("id", lease.id)
    }
  } catch {
    // Per-lease failure is non-fatal
  }
}

async function handleNoticeExpired(supabase: Supabase, lease: NoticeLease, today: string): Promise<void> {
  // L11 fires before status flip: once status = expired the lease won't appear in next cron run,
  // so if queueing also fails the comm would be silently lost.
  if (lease.tenant_id) {
    try {
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      supabase.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
      supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
      fetchOrgSettings(lease.org_id),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    if (!tenant?.email) return

    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    const endDateDisplay = fmtDateLongZA(today)

    await routeAndSend({
      orgId: lease.org_id,
      tenantId: lease.tenant_id,
      templateKey: "lease.terminated",
      to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
      subject: `Your tenancy has ended - ${propertyLabel}`,
      emailElement: React.createElement(LeaseTerminatedEmail, {
        branding: buildBranding(orgSettings),
        tenantName,
        propertyLabel,
        leaseEndDate: endDateDisplay,
        senderName: orgSettings?.name ?? "Pleks",
      }),
      entityType: "lease",
      entityId: lease.id,
      triggerEventType: "cron:lease-expiry-check",
      triggerEventId: lease.id,
      toneVariant: "n/a",
    })
    } catch {
      // Comm failure is non-fatal
    }
  }

  await supabase.from("leases").update({ status: "expired" }).eq("id", lease.id)
  await supabase.from("units").update({ status: "vacant" }).eq("id", lease.unit_id)

  await supabase.from("unit_status_history").insert({
    unit_id: lease.unit_id,
    org_id: lease.org_id,
    from_status: "notice",
    to_status: "vacant",
    reason: "Notice period ended",
  })

  await supabase.from("tenancy_history").update({
    move_out_date: today,
    status: "ended",
  }).eq("lease_id", lease.id).eq("status", "active")
}

export async function GET(req: Request) {
  // Dropped the `?secret=` query-param fallback: secrets in URLs leak into access logs, proxy logs, and
  // browser history. Nothing invoked it that way (the daily orchestrator passes the header in-process,
  // and the cPanel crons use -H "x-cron-secret"), so this closes the hole without breaking a caller.
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  const today = saTodayISO()
  let processed = 0

  // 1. CPA auto-renewal notices due (s14(2)(b)(ii): 40–80 business days before expiry).
  // Computed at EVALUATION TIME, never stamped — `auto_renewal_notice_due` used to be frozen onto the row
  // at lease creation as 40 CALENDAR days (~27 business days, statutorily too late). We band candidates to
  // leases expiring within the notice horizon (120 calendar days comfortably contains the 80-business-day
  // window ≈ 112 days AND keeps every backward walk inside the holiday table), then the strict walker gives
  // each lease its exact due date. See lib/leases/cpaRenewal + ADDENDUM_70K §6.
  const renewalBandEnd = addCalendarDays(today, 120)
  const { data: renewalCandidates, error: needNoticeError } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, end_date, unit_id, units(unit_number, properties(name))")
    .eq("is_fixed_term", true)
    .eq("cpa_applies", true)
    .is("auto_renewal_notice_sent_at", null)
    .eq("status", "active")
    .gte("end_date", today)
    .lte("end_date", renewalBandEnd)
    logQueryError("GET leases", needNoticeError)

  for (const lease of renewalCandidates || []) {
    if (!lease.end_date) continue
    const dueDate = cpaRenewalNoticeDueSafe(lease.end_date)
    if (!dueDate) {
      // A banded candidate whose date is uncomputable means the holiday table's horizon is now inside the
      // notice window — a real ops signal that saHolidays.json must be extended. Skip (never fire against an
      // unknown holiday calendar), let the 90-day horizon sentinel in health.ts carry the alert.
      console.warn(`[lease-expiry-check] CPA s14 notice date uncomputable for lease ${lease.id} (end ${lease.end_date}) — extend saHolidays.json`)
      continue
    }
    if (today < dueDate) continue   // the 40–80 business-day window has not opened yet
    await handleCpaRenewal(supabase, lease as CpaLease)
    processed++
  }

  // 2. L9 — expiry reminder T-30: fixed-term active leases expiring in exactly 30 days
  const reminderTargetStr = addCalendarDays(today, 30)

  const { data: expiringLeases, error: expiringLeasesError } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, end_date, unit_id, cpa_applies_at_signing")
    .eq("is_fixed_term", true)
    .eq("status", "active")
    .lte("end_date", reminderTargetStr)
    .gt("end_date", today)
    .is("expiry_reminder_sent_at", null)
    logQueryError("GET leases", expiringLeasesError)

  for (const lease of expiringLeases || []) {
    await handleExpiryReminder(supabase, lease)
    processed++
  }

  // 3. Auto-convert expired fixed-term leases to month-to-month
  const { data: expired, error: expiredError } = await supabase
    .from("leases")
    .select("id, org_id")
    .eq("is_fixed_term", true)
    .eq("status", "active")
    .lt("end_date", today)
    logQueryError("GET leases", expiredError)

  for (const lease of expired || []) {
    await supabase.from("leases").update({
      status: "month_to_month",
      is_fixed_term: false,
      end_date: null,
    }).eq("id", lease.id)

    await recordAudit(supabase, { orgId: lease.org_id, table: "leases", recordId: lease.id, action: "UPDATE", after: { event: "auto_converted_to_month_to_month" } })
    processed++
  }

  // 4. Leases in notice period that have passed notice_period_end — L11 term comm
  const { data: noticeExpired, error: noticeExpiredError } = await supabase
    .from("leases")
    .select("id, org_id, unit_id, tenant_id")
    .eq("status", "notice")
    .lt("notice_period_end", today)
    logQueryError("GET leases", noticeExpiredError)

  for (const lease of noticeExpired || []) {
    await handleNoticeExpired(supabase, lease as NoticeLease, today)
    processed++
  }

  return NextResponse.json({ ok: true, processed })
}
