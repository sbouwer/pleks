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
}

type NoticeLease = {
  id: string
  org_id: string
  unit_id: string
  tenant_id: string | null
}

async function handleCpaRenewal(supabase: Supabase, lease: CpaLease): Promise<void> {
  await supabase.from("leases").update({
    auto_renewal_notice_sent_at: new Date().toISOString(),
  }).eq("id", lease.id)

  await supabase.from("audit_log").insert({
    org_id: lease.org_id,
    table_name: "leases",
    record_id: lease.id,
    action: "UPDATE",
    new_values: { event: "cpa_renewal_notice_sent" },
  })

  if (!lease.tenant_id || !lease.end_date) return

  const [{ data: tenant }, { data: org }, orgSettings] = await Promise.all([
    supabase.from("tenant_view").select("email, first_name, last_name").eq("id", lease.tenant_id).single(),
    supabase.from("organisations").select("name, type, trading_as, first_name, last_name, title, initials, email, phone, brand_accent_color").eq("id", lease.org_id).single(),
    fetchOrgSettings(lease.org_id),
  ])
  const unit = lease.units as { unit_number: string; properties: { name: string } } | null
  if (!tenant?.email) return

  void sendLeaseRenewalNotice(
    { email: tenant.email, name: [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant" },
    {
      id: lease.id,
      endDate: lease.end_date,
      propertyName: unit?.properties?.name ?? "",
      unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : "Unit",
    },
    { orgId: lease.org_id, orgName: org ? getOrgDisplayName(org) : "Pleks", orgPhone: org?.phone ?? undefined, orgEmail: org?.email ?? undefined, branding: buildBranding(orgSettings) }
  )
}

async function handleExpiryReminder(supabase: Supabase, lease: ExpiryLease): Promise<void> {
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
    const endDateDisplay = new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    const daysRemaining = Math.ceil((new Date(lease.end_date).getTime() - Date.now()) / 86_400_000)

    await routeAndSend({
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
      }),
      entityType: "lease",
      entityId: lease.id,
      triggerEventType: "cron:lease-expiry-check",
      triggerEventId: lease.id,
      toneVariant: "n/a",
    })
    await supabase.from("leases").update({ expiry_reminder_sent_at: new Date().toISOString() }).eq("id", lease.id)
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
    const endDateDisplay = new Date(today).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

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
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().split("T")[0]
  let processed = 0

  // 1. CPA auto-renewal notices due
  const { data: needNotice } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, end_date, unit_id, units(unit_number, properties(name))")
    .eq("is_fixed_term", true)
    .eq("cpa_applies", true)
    .is("auto_renewal_notice_sent_at", null)
    .eq("status", "active")
    .lte("auto_renewal_notice_due", today)

  for (const lease of needNotice || []) {
    await handleCpaRenewal(supabase, lease as CpaLease)
    processed++
  }

  // 2. L9 — expiry reminder T-30: fixed-term active leases expiring in exactly 30 days
  const reminderTarget = new Date(today)
  reminderTarget.setDate(reminderTarget.getDate() + 30)
  const reminderTargetStr = reminderTarget.toISOString().split("T")[0]

  const { data: expiringLeases } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, end_date, unit_id")
    .eq("is_fixed_term", true)
    .eq("status", "active")
    .lte("end_date", reminderTargetStr)
    .gt("end_date", today)
    .is("expiry_reminder_sent_at", null)

  for (const lease of expiringLeases || []) {
    await handleExpiryReminder(supabase, lease as ExpiryLease)
    processed++
  }

  // 3. Auto-convert expired fixed-term leases to month-to-month
  const { data: expired } = await supabase
    .from("leases")
    .select("id, org_id")
    .eq("is_fixed_term", true)
    .eq("status", "active")
    .lt("end_date", today)

  for (const lease of expired || []) {
    await supabase.from("leases").update({
      status: "month_to_month",
      is_fixed_term: false,
      end_date: null,
    }).eq("id", lease.id)

    await supabase.from("audit_log").insert({
      org_id: lease.org_id,
      table_name: "leases",
      record_id: lease.id,
      action: "UPDATE",
      new_values: { event: "auto_converted_to_month_to_month" },
    })
    processed++
  }

  // 4. Leases in notice period that have passed notice_period_end — L11 term comm
  const { data: noticeExpired } = await supabase
    .from("leases")
    .select("id, org_id, unit_id, tenant_id")
    .eq("status", "notice")
    .lt("notice_period_end", today)

  for (const lease of noticeExpired || []) {
    await handleNoticeExpired(supabase, lease as NoticeLease, today)
    processed++
  }

  return NextResponse.json({ ok: true, processed })
}
