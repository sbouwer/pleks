/**
 * app/api/cron/holiday-sentinel/route.ts — daily watch on the SA public-holiday table (ADDENDUM_70K Phase C)
 *
 * Route:  /api/cron/holiday-sentinel
 * Auth:   x-cron-secret header (requireCronAuth — item-1 SSOT)
 * Data:   Nager.Date + Calendarific (read-only witnesses) + the bundled saHolidays.json; writes NOTHING
 * Notes:  QUIET BY DEFAULT. Digests to ADMIN_EMAIL only on: a Class-A/B diff, a witness disagreement, or the
 *         horizon within 90 days. The auditor is a SKEPTIC, never an authority (D-7d) — any table change
 *         stays a reviewed PR. The 90-day horizon nag MOVED here from a standalone check so there is one
 *         home, not two. NOT wrapped in withCronRun and NOT in TRACKED_CRONS — a cron_runs row from a job
 *         checkCrons never heard of would falsely degrade deep-health (the chronic "crons: degraded" trap).
 *         cPanel schedule: daily. Cost: two free API calls a day.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/cron/auth"
import { runHolidayAudit } from "@/lib/dates/holidayAuditFetch"
import { checkHolidayTable } from "@/lib/observability/health"
import { sendCronDigest, type CronJobDetail } from "@/lib/cron/cronDigest"
import { saTodayISO } from "@/lib/dates"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const detail: Record<string, CronJobDetail> = {}

  // 1. Horizon — the load-bearing statutory signal. Degraded/down must reach a human.
  const horizon = checkHolidayTable()
  if (horizon.status === "down") detail.holiday_horizon = { status: "error", error: horizon.error }
  else if (horizon.status === "degraded") detail.holiday_horizon = { status: "partial", error: horizon.error }
  else detail.holiday_horizon = { status: "ok" }

  // 2. Audit — diff the table against the feeds.
  const audit = await runHolidayAudit()
  if (!audit.ran) {
    // Auditor dark ≠ statutory failure: the horizon check + addBusinessDays' throw are the independent
    // backstop. Log for Sentry, but do not digest a single blip on a free API into an admin email.
    console.warn("[holiday-sentinel] Nager.Date unreachable — proclamation audit skipped this run (horizon backstop unaffected).")
    detail.holiday_audit = { status: "ok" }
  } else if (audit.needsReview) {
    const a = audit.primary!.diffs.filter((d) => d.cls === "A").map((d) => d.date)
    const b = audit.primary!.diffs.filter((d) => d.cls === "B").map((d) => d.date)
    detail.holiday_audit = {
      status: "failed",
      error:
        `Holiday table needs review — ` +
        (a.length ? `Class A (API has, table lacks): ${a.join(", ")}. ` : "") +
        (b.length ? `Class B (table has, API lacks — table wins pending review): ${b.join(", ")}. ` : "") +
        (audit.witnessDisagreementDates.length ? `Witnesses disagree on: ${audit.witnessDisagreementDates.join(", ")}. ` : "") +
        `Verify against the Government Gazette; any change is a reviewed PR with a per-entry source.`,
    }
  } else {
    detail.holiday_audit = { status: "ok" }
  }

  const digest = await sendCronDigest(saTodayISO(), detail)

  let auditState = "auditor_dark"
  if (audit.ran) auditState = audit.needsReview ? "needs_review" : "clean"

  return NextResponse.json({
    ok: true,
    horizon: horizon.status,
    audit: auditState,
    witnessDisagreements: audit.witnessDisagreementDates.length,
    digested: digest.emailed,
  })
}
