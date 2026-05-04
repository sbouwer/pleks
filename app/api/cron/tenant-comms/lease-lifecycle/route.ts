/**
 * app/api/cron/tenant-comms/lease-lifecycle/route.ts — lease lifecycle comms: sign reminder (L2) + escalation notice (L7)
 *
 * Route:  GET /api/cron/tenant-comms/lease-lifecycle
 * Auth:   x-cron-secret header — called by daily orchestrator
 * Data:   leases, tenant_view, units, audit_log, communication_log (service client)
 * Notes:  BUILD_63 Phase 5.
 *         L2: fires T+3 after sent_for_signing_at when lease still in pending_signing.
 *         L7: fires T-30 before escalation_review_date on active leases.
 *         Both use idempotency guard columns (sign_reminder_sent_at, escalation_notice_sent_at).
 */
import * as React from "react"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { LeaseSignReminderEmail, buildLeaseSignReminderSms } from "@/lib/comms/templates/tenant/leases/lease-sign-reminder"
import { LeaseEscalationNoticeEmail } from "@/lib/comms/templates/tenant/leases/lease-escalation-notice"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  const signReminderCutoff = new Date(today)
  signReminderCutoff.setDate(signReminderCutoff.getDate() - 3)

  const escalationTarget = new Date(today)
  escalationTarget.setDate(escalationTarget.getDate() + 30)
  const escalationTargetStr = escalationTarget.toISOString().split("T")[0]

  let sent = 0
  let skipped = 0

  // ── L2: sign reminder — pending_signing leases unsent for 3+ days ────────────
  const { data: unsignedLeases, error: l2Error } = await service
    .from("leases")
    .select("id, org_id, tenant_id, unit_id, sent_for_signing_at")
    .eq("status", "pending_signing")
    .is("sign_reminder_sent_at", null)
    .not("sent_for_signing_at", "is", null)
    .lte("sent_for_signing_at", signReminderCutoff.toISOString())

  if (l2Error) {
    console.error("[lease-lifecycle] L2 query failed:", l2Error.message)
  }

  for (const lease of unsignedLeases ?? []) {
    try {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
        service.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
        fetchOrgSettings(lease.org_id),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null

      if (!tenant?.email && !tenant?.phone) { skipped++; continue }

      const tenantName = [tenant?.first_name, tenant?.last_name].filter(Boolean).join(" ") || "Tenant"
      const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
      const senderName = orgSettings?.name ?? "Pleks"
      const sentAt = new Date(lease.sent_for_signing_at as string)
      const daysUnsigned = Math.floor((today.getTime() - sentAt.getTime()) / 86_400_000)

      const result = await routeAndSend({
        orgId: lease.org_id,
        tenantId: lease.tenant_id,
        templateKey: "lease.sign_reminder",
        to: { email: tenant?.email ?? undefined, phone: (tenant?.phone as string | null) ?? undefined, name: tenantName },
        subject: `Reminder: your lease for ${propertyLabel} is still awaiting your signature`,
        emailElement: React.createElement(LeaseSignReminderEmail, {
          branding: buildBranding(orgSettings),
          tenantName,
          propertyLabel,
          daysUnsigned,
          senderName,
        }),
        smsBody: buildLeaseSignReminderSms(tenant?.first_name ?? "Tenant", propertyLabel, senderName),
        entityType: "lease",
        entityId: lease.id,
        triggerEventType: "cron:lease-lifecycle",
        triggerEventId: lease.id,
        toneVariant: "n/a",
      })

      if (result.success) {
        await service.from("leases").update({ sign_reminder_sent_at: new Date().toISOString() }).eq("id", lease.id)
        sent++
      } else {
        skipped++
      }
    } catch (err) {
      console.error("[lease-lifecycle] L2 lease", lease.id, "failed:", err)
      skipped++
    }
  }

  // ── L7: escalation notice — active leases with escalation_review_date in 30 days ──
  const { data: escalatingLeases, error: l7Error } = await service
    .from("leases")
    .select("id, org_id, tenant_id, unit_id, rent_amount_cents, escalation_percent, escalation_review_date")
    .eq("status", "active")
    .eq("escalation_review_date", escalationTargetStr)
    .is("escalation_notice_sent_at", null)

  if (l7Error) {
    console.error("[lease-lifecycle] L7 query failed:", l7Error.message)
  }

  for (const lease of escalatingLeases ?? []) {
    try {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
        service.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
        fetchOrgSettings(lease.org_id),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null

      if (!tenant?.email) { skipped++; continue }

      const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
      const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
      const senderName = orgSettings?.name ?? "Pleks"
      const currentCents = lease.rent_amount_cents as number
      const pct = (lease.escalation_percent as number) ?? 10
      const newCents = Math.round(currentCents * (1 + pct / 100))
      const fmt = (c: number) => "R " + (c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
      const effectiveDateDisplay = new Date(lease.escalation_review_date as string).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

      const result = await routeAndSend({
        orgId: lease.org_id,
        tenantId: lease.tenant_id,
        templateKey: "lease.escalation_notice",
        to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
        subject: `Upcoming rent escalation - ${propertyLabel}`,
        emailElement: React.createElement(LeaseEscalationNoticeEmail, {
          branding: buildBranding(orgSettings),
          tenantName,
          propertyLabel,
          currentRentDisplay: fmt(currentCents),
          newRentDisplay: fmt(newCents),
          escalationPercent: pct,
          effectiveDate: effectiveDateDisplay,
          senderName,
        }),
        entityType: "lease",
        entityId: lease.id,
        triggerEventType: "cron:lease-lifecycle",
        triggerEventId: lease.id,
        toneVariant: "n/a",
      })

      if (result.success) {
        await service.from("leases").update({ escalation_notice_sent_at: new Date().toISOString() }).eq("id", lease.id)
        sent++
      } else {
        skipped++
      }
    } catch (err) {
      console.error("[lease-lifecycle] L7 lease", lease.id, "failed:", err)
      skipped++
    }
  }

  return Response.json({ ok: true, target_date: todayStr, sent, skipped })
}
