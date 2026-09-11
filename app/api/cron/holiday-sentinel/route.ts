/**
 * app/api/cron/holiday-sentinel/route.ts — daily watch on the SA public-holiday table (ADDENDUM_70K Phase C)
 *
 * Route:  /api/cron/holiday-sentinel
 * Auth:   x-cron-secret header (requireCronAuth — item-1 SSOT)
 * Data:   Nager.Date + gov.za notices RSS (read-only witnesses) + the bundled saHolidays.json; writes NOTHING
 * Notes:  QUIET BY DEFAULT. Digests to ADMIN_EMAIL only on: a Class-A/B diff, a gov.za PROCLAMATION notice,
 *         a feed window that could not cover the polling interval, or the horizon within
 *         HOLIDAY_HORIZON_WARN_DAYS (derived: CPA_RENEWAL_CANDIDATE_BAND_DAYS + 30 — do not restate it).
 *
 *         The gov.za notices feed (added 2026-09-09) is the ad-hoc-proclamation watch, and it exists because
 *         Nager demonstrably misses them: of three known s2A proclamations, Nager carries 2023-12-15 and has
 *         never carried 2016-08-03 or 2021-11-01. gov.za publishes all of them, being the publisher. It
 *         fires at GAZETTING, not at announcement — a holiday announced but not yet gazetted is correctly
 *         invisible. Calendarific was removed the same day: its key was never set in any environment.
 *
 *         The auditor is a SKEPTIC, never an authority (D-7d) — any table change
 *         stays a reviewed PR. The 90-day horizon nag MOVED here from a standalone check so there is one
 *         home, not two. NOT wrapped in withCronRun and NOT in TRACKED_CRONS — a cron_runs row from a job
 *         checkCrons never heard of would falsely degrade deep-health (the chronic "crons: degraded" trap).
 *         cPanel schedule: daily. Cost: ONE free Nager call per year of table coverage, plus one gov.za
 *         feed read — so it scales with HOLIDAY_TABLE_COVERS_FROM..THROUGH and MOVED when 70L derived the
 *         horizon. Do not restate the number here; `yearsInWindow()` in holidayAuditFetch.ts derives it.
 *         ⚠ fetchNagerZA is all-or-nothing (any non-200 → null), so each added year is another way for
 *         the auditor to go dark — and the route reports !audit.ran as status "ok". See M-125.
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
    // UNACTIONED only. A notice the table already cites by link asked for a decision that has been
    // made, and re-reporting it would keep this digest failing daily until the notice rolls off a
    // ten-item feed — the exact "a digest that always fails is a digest nobody reads" failure the
    // Nager branch already refuses. Still visible below, as INFO.
    const procs = audit.unactionedNotices
    detail.holiday_audit = {
      status: "failed",
      error:
        `Holiday table needs review — ` +
        // The proclamation notices go FIRST: they are the only signal here that comes from the publisher
        // rather than an aggregator, and the only one that can announce a date no feed knows yet.
        (procs.length
          ? `GAZETTE NOTICE (gov.za): ${procs.map((p) => `"${p.title}" ${p.link}`).join(" | ")}. ` +
            `Read the proclamation and add the date with basis "PHA s2A" and its Gazette reference. `
          : "") +
        (a.length ? `Class A (API has, table lacks): ${a.join(", ")}. ` : "") +
        (b.length ? `Class B (table has, API lacks — table wins pending review): ${b.join(", ")}. ` : "") +
        (audit.govZa?.windowOverrun
          ? `gov.za feed window did not cover the polling interval (${audit.govZa.itemsSeen} items, oldest ` +
            `${audit.govZa.oldestItem ?? "unparseable"}) — notices may have rolled off unseen. Check ` +
            `gov.za/documents/notices directly for this period.`
          : "") +
        `Verify against the Government Gazette; any change is a reviewed PR with a per-entry source.`,
    }
  } else {
    detail.holiday_audit = { status: "ok" }
  }

  // An acknowledged notice is worth SEEING and not worth emailing about: it is the feed still carrying a
  // proclamation the table already answered. Logged, so "why is gov.za quiet about 4 November?" has an
  // answer in the run output, and counted in the JSON below so the silence is measurable rather than assumed.
  if (audit.actionedNotices.length) {
    console.info(
      `[holiday-sentinel] ${audit.actionedNotices.length} gazette notice(s) already cited by the table, not re-reported: ` +
        audit.actionedNotices.map((p) => p.link).join(" | "),
    )
  }

  // gov.za unreachable is reported SEPARATELY from a clean audit. It is not needsReview — one blip on a
  // government website must not email an admin — but it must not read as "no proclamations" either.
  if (!audit.govZa) {
    console.warn("[holiday-sentinel] gov.za notices feed unreachable — proclamation watch did not run this cycle.")
  }

  const digest = await sendCronDigest(saTodayISO(), detail)

  let auditState = "auditor_dark"
  if (audit.ran) auditState = audit.needsReview ? "needs_review" : "clean"

  return NextResponse.json({
    ok: true,
    horizon: horizon.status,
    audit: auditState,
    govZaReachable: !!audit.govZa,
    proclamationNotices: audit.govZa?.proclamations.length ?? 0,
    unactionedNotices: audit.unactionedNotices.length,
    acknowledgedNotices: audit.actionedNotices.length,
    feedWindowOverrun: !!audit.govZa?.windowOverrun,
    digested: digest.emailed,
  })
}
