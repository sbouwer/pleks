/**
 * lib/reports/cpaNoticeSchedule.ts — the CPA s14 notice schedule (active leases nearing end, with the notice-due
 * date and whether the window is still open)
 *
 * Data:   reads `leases` (+ joined tenants/contacts/units/properties) ending inside the notice band for the org
 * Notes:  Routed through lib/leases/cpaRenewal — the declared SSOT — and NOT its own arithmetic.
 *
 *         It used to compute the notice date as `end_date − 28 CALENDAR days` via raw `Date.setDate`, holiday-
 *         blind, while the cron that actually FIRES the notice used the SSOT's 60 BUSINESS days. The report and
 *         the cron therefore gave different notice dates for the same lease — and the report's was inside the
 *         statutorily-too-late zone, so an agent reading it could believe they had weeks left when the lawful
 *         window had days. `cpaRenewal.ts`'s own header records that this date was once computed four different
 *         wrong ways; this file was a fifth.
 *
 *         Two DIFFERENT dates, deliberately:
 *           notice_due_by — the 60-business-day TARGET (when to send). Middle of the s14 40–80 bd window.
 *           overdue       — decided by the 40-business-day FLOOR (the last lawful day), via the tested
 *                           `isRenewalNoticeMissed` predicate. Using the target to decide "overdue" would flag
 *                           a lease as missed while ~20 lawful business days remained.
 *
 *         notice_due_by is NULLABLE: past the holiday table's horizon the date cannot be computed at all, and
 *         a report must degrade to "—" rather than invent one.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { addCalendarDays, saTodayISO } from "@/lib/dates"
import {
  cpaRenewalNoticeDueSafe, cpaRenewalNoticeFloorSafe, isRenewalNoticeMissed,
  CPA_RENEWAL_CANDIDATE_BAND_DAYS,
} from "@/lib/leases/cpaRenewal"
import type { CpaNoticeScheduleData, CpaNoticeRow, ReportFilters } from "./types"

export async function buildCpaNoticeSchedule(filters: ReportFilters): Promise<CpaNoticeScheduleData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const today = saTodayISO()
  // The SAME band the cron uses. The old 90-day cutoff was NARROWER than the s14 window's outer edge
  // (80 business days ≈ 112 calendar days), so a lease whose notice window had already OPENED could be
  // missing from the very report that exists to catch it.
  const cutoff = addCalendarDays(today, CPA_RENEWAL_CANDIDATE_BAND_DAYS)

  const { data, error } = await db
    .from("leases")
    .select("id, end_date, tenant_id, unit_id, status, auto_renewal_notice_sent_at, tenants(contacts(first_name, last_name, company_name, entity_type)), units(unit_number, property_id, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["active", "notice"])
    .not("end_date", "is", null)
    .lte("end_date", cutoff)
    .order("end_date", { ascending: true })
  if (error) console.error("cpaNoticeSchedule:", error.message)

  const rows: CpaNoticeRow[] = (data ?? [])
    .filter((l) => {
      if (!propertyIds?.length) return true
      const unitRaw = l.units as unknown as { property_id: string } | null
      return propertyIds.includes(unitRaw?.property_id ?? "")
    })
    .map((l) => {
      const tRaw = l.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
      const c = tRaw?.contacts
      const tenantName = c?.entity_type === "company"
        ? (c.company_name ?? "Tenant")
        : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Tenant"
      const unitRaw = l.units as unknown as { unit_number: string; properties: { name: string } | null } | null

      const leaseEnd = l.end_date as string
      const noticeDueBy = cpaRenewalNoticeDueSafe(leaseEnd)        // 60-bd TARGET, null past the horizon
      const noticeFloor = cpaRenewalNoticeFloorSafe(leaseEnd)      // 40-bd FLOOR — the last lawful day
      const noticeSent = l.auto_renewal_notice_sent_at != null

      let status: string
      if (noticeSent) status = "sent"
      else if (isRenewalNoticeMissed(noticeFloor, today)) status = "overdue"   // strictly PAST the floor
      else status = "pending"

      return {
        lease_id: l.id as string,
        tenant_name: tenantName,
        unit_number: unitRaw?.unit_number ?? "—",
        property_name: unitRaw?.properties?.name ?? "—",
        lease_end: leaseEnd,
        days_remaining: Math.floor(
          (new Date(`${leaseEnd}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / 86_400_000,
        ),
        notice_due_by: noticeDueBy,
        status,
      }
    })

  const weekStr = addCalendarDays(today, 7)

  return {
    as_at: new Date(),
    rows,
    overdue_count: rows.filter((r) => r.status === "overdue").length,
    // A lease whose notice date cannot be computed (past the horizon) is not "due this week" — it is unknown.
    due_this_week: rows.filter((r) => r.status === "pending" && r.notice_due_by !== null && r.notice_due_by >= today && r.notice_due_by <= weekStr).length,
    due_30d: rows.filter((r) => r.status === "pending").length,
  }
}
