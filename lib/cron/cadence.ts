/**
 * lib/cron/cadence.ts — how long each tracked cron may go without a success before it is stale
 *
 * Notes: moved here from lib/observability/health.ts on 2026-09-14 so the two readers of cron freshness read
 *        ONE map: checkCrons (deep-health) and the daily digest's grader (classifyCronRuns). The digest needed
 *        it because "failing = the latest run failed" really means the latest RECORDED run, and a run that
 *        dies before recording, or whose cron_runs insert is lost, leaves a successful row as the tail. With
 *        the threshold, a stale tail grades failing instead of "succeeded since".
 *        Only 8 of the wrapped jobs are here. A wrapped job outside this map has no staleness check in
 *        either reader — M-133 is the ratchet that would make that a failure rather than a skip.
 */

// Tracked top-level scheduled crons → how long since the last SUCCESS before "stale". Thresholds are ~2–3× the
// cadence so a single transient miss doesn't flap. Every external (cPanel-triggered) cron now writes a cron_runs
// row via withCronRun (lib/cron/withCronRun.ts), so they're all observable here — this is what finally lets
// checkCrons track more than "daily". The orchestrator's IN-PROCESS children are still covered by a fresh
// "daily" row (don't add them — they don't self-insert), and monthly jobs run inside it (day-of-month gated).
// Note: right after the withCronRun deploy the newly-tracked crons have no rows yet, so they read stale until
// their first run (≤~4h for the 4-hourly ones, ≤~24h for the daily ones). That's a truthful, self-healing
// "degraded" — not "down", since "daily" itself stays fresh — not a bug.
export const TRACKED_CRONS: Readonly<Record<string, number>> = {
  daily:                   48 * 60 * 60 * 1000,  // daily 05:00 SAST = 03:00 UTC (orchestrator; cPanel's clock is SAST)
  screening_line_runner:    2 * 60 * 60 * 1000,  // every 15m
  mandatory_retry:          3 * 60 * 60 * 1000,  // every 1h
  bank_feed_sync:           9 * 60 * 60 * 1000,  // every 4h
  arrears_sequence:         9 * 60 * 60 * 1000,  // every 4h
  maintenance_delay_check:  9 * 60 * 60 * 1000,  // every 4h
  check_links:              9 * 60 * 60 * 1000,  // every 4h
  application_reminders:   30 * 60 * 60 * 1000,  // daily 06:00 SAST = 04:00 UTC
}
