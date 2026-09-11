---
paths:
  - "app/api/cron/**"
  - "lib/cron/**"
  - "lib/observability/**"
---

## CRON ARCHITECTURE — ALL CRONS TRIGGERED FROM CPANEL

**No cron runs from `vercel.json`.** Vercel Cron was removed (2026-05-29): its auth model
injects `Authorization: Bearer <CRON_SECRET>` and that injection did not arrive reliably,
so scheduled runs 401'd before the handler executed. cPanel curl crons (explicit
`x-cron-secret` header, hitting `app.pleks.co.za` directly — no redirect to strip the
header) are what work, so EVERY cron is now triggered from cPanel on the Yoros hosting
account (`yoroscoz` user). `vercel.json` is just `{ "buildCommand": "next build" }` — do
NOT re-add a `crons` array, and do NOT put `npm run check` in `buildCommand` (it broke
deploys; check belongs in CI + pre-push).
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — sketch: a check parses `vercel.json` and fails if it gains a `crons` key or a `buildCommand` containing `npm run check`. (Note: `vercel.json` is strict JSON, so this doctrine cannot live as an in-file comment — rung 4 single-file doctrine does not apply; a script is the only carrier.)

### The daily orchestrator (cPanel, 05:00 UTC)
`/api/cron/daily` — orchestrates all truly-daily jobs sequentially (~11s, mostly I/O
wait). cPanel entry:
```
0 5 * * *  /usr/bin/curl -s -m 90 -X GET "https://app.pleks.co.za/api/cron/daily" -H "x-cron-secret: <CRON_SECRET>" > /dev/null 2>&1
```
The route declares `runtime="nodejs"` + `maxDuration=90` (Hobby caps at 60s regardless;
honoured on Pro). Monthly jobs run INSIDE this orchestrator, gated by a day-of-month check.

### cPanel curl crons (yoroscoz hosting)
| Job | Endpoint | Cadence | HTTP method |
|-----|----------|---------|-------------|
| mandatory-retry | `/api/cron/tenant-comms/mandatory-retry` | Every 1h | POST |
| screening-line-runner | `/api/cron/screening-line-runner` | Every 15m | GET |
| bank-feed-sync | `/api/cron/bank-feed-sync` | Every 4h | GET |
| arrears-sequence | `/api/cron/arrears-sequence` | Every 4h | GET |
| maintenance-delay-check | `/api/cron/maintenance-delay-check` | Every 4h | GET |
| check-links | `/api/cron/check-links` | Every 4h | GET |
| application-reminders | `/api/cron/application-reminders` | Daily 06:00 UTC | GET |
| holiday-sentinel | `/api/cron/holiday-sentinel` | Daily | GET |

> **holiday-sentinel** (ADDENDUM_70K Phase C): diffs the SA public-holiday table against Nager.Date, watches
> gov.za's notices feed for gazetted proclamations, and moves the 90-day horizon nag here. Quiet by default —
> digests to `ADMIN_EMAIL` only on a Class-A/B diff, a gov.za public-holiday notice, an unprovable feed
> window, or the horizon within 90 days. Writes nothing (D-7d). NOT in the daily orchestrator and NOT wrapped
> in `withCronRun` (a `cron_runs` row from a job `TRACKED_CRONS` never heard of would falsely degrade
> deep-health).
>
> **The two witnesses are of different KINDS, and that is the point.** Nager returns a date SET, which is
> diffed. gov.za's RSS returns gazette NOTICES, which are title-matched and handed to a human — nothing
> parses a date out of a notice title (the real ones vary too much; a confident wrong holiday is worse than
> none). gov.za is the witness that closes Nager's ad-hoc gap: measured 2026-09-09 against three known s2A
> proclamations, Nager carried 2023-12-15 and has never carried 2016-08-03 or 2021-11-01.
>
> **A Calendarific witness was removed on 2026-09-09.** Its API key was never set in any environment, so the
> fetcher returned null on every run this code has ever made and the disagreement check was called zero
> times — while the file, this table and the route header all described a two-witness design. An inert
> control is worse than an absent one: it is counted as coverage by everyone reading the file.
>
> **The gov.za feed caps at TEN ITEMS — a count, not a time window.** Gazette publication is bursty, so on a
> heavy day ten notices can span a few hours and a daily poll silently drops everything older. The run cannot
> see what rolled off, so it reports the CONDITION instead (`windowOverrun`: the oldest item is younger than
> one polling interval). **If that starts firing regularly, the fix is a faster cadence** — raise the cPanel
> frequency AND `GOVZA_POLL_INTERVAL_MS` in `lib/dates/holidayAuditFetch.ts` together; the constant's only
> job is to mirror the line below, and a stale constant reports clean while blind.
>
> cPanel entry (LIVE since 2026-07-11):
> ```
> 0 7 * * *  /usr/bin/curl -s -m 60 -X GET "https://app.pleks.co.za/api/cron/holiday-sentinel" -H "x-cron-secret: <CRON_SECRET>" > /dev/null 2>&1
> ```

All use the same `x-cron-secret` header auth.

> **Note:** `application-reminders` is the one *daily* job triggered standalone here rather than from the daily
> orchestrator (it predates it). It could be folded into `/api/cron/daily` later to gain failure-digest
> coverage; until then its failures surface only in logs/Sentry (it does use the C-1 await+log belt).

**When adding a new cron job**, decide:
- Once daily is fine → add to `app/api/cron/daily/route.ts` orchestrator
- Needs higher frequency → add a cPanel curl entry AND document it in this table
- Monthly → add to the `dayOfMonth === N` gate in `daily/route.ts`

**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — sketch: enumerate `app/api/cron/**/route.ts` on disk and assert each one appears either in the daily orchestrator's source or in this table's cPanel-entry list — an undocumented cron currently goes unnoticed the same way an undocumented public route used to (Category 8's disk-derived census, before it existed).

**Health-check tracking:** `lib/observability/health.ts` `checkCrons` tracks only
top-level scheduled `job_name`s that ACTUALLY write a `cron_runs` row. Adding a name that
no handler writes makes it read permanently stale and falsely degrades deep-health — this
was the chronic "crons: degraded" cause. A completed "daily" row implies its
in-orchestrator child + monthly jobs ran. **Read the map in the code, never a count here:**
this sentence said *"currently just `["daily"]`"* until 2026-09-11, when it held eight
names, and a triage pass read the stale count as the design.
**The converse gap is the live one — M-133.** Being absent from `TRACKED_CRONS` is not
neutral: a wrapped cron outside it that stops firing writes no row, so the failure-only
digest has nothing to report AND no staleness threshold fires. Measured 2026-09-11, five of
the thirteen jobs writing `cron_runs` are in no staleness map, `screening_jobs` among them.
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — sketch: assert every name in `TRACKED_CRONS` is written by at least one route calling `withCronRun` with that exact `job_name` — the precise mismatch that caused the chronic "crons: degraded" false positive this paragraph describes.

**Post-launch (Pro) plan:** split the daily orchestrator into grouped endpoints
(daily-financial / daily-comms / daily-engine, etc.) once on Pro — unnecessary on Hobby
(the 60s cap + I/O-not-CPU billing make the monolith correct for now). Queued separately:
monthly jobs self-reporting `cron_runs` (only when they fire) so silent month-end
non-execution becomes observable before the first pilot month-end.

---

