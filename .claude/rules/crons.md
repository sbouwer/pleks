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

> **holiday-sentinel** (ADDENDUM_70K Phase C): diffs the SA public-holiday table against Nager.Date (+ optional
> Calendarific witness) and moves the 90-day horizon nag here. Quiet by default — digests to `ADMIN_EMAIL`
> only on a Class-A/B diff, a witness disagreement, or the horizon within 90 days. Writes nothing (D-7d). NOT
> in the daily orchestrator and NOT wrapped in `withCronRun` (a `cron_runs` row from a job `TRACKED_CRONS`
> never heard of would falsely degrade deep-health). cPanel entry to add:
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

**Health-check tracking:** `lib/observability/health.ts` `checkCrons` tracks only
top-level scheduled `job_name`s that ACTUALLY write a `cron_runs` row (currently just
`["daily"]`). Adding a name that no handler writes makes it read permanently stale and
falsely degrades deep-health — this was the chronic "crons: degraded" cause. A completed
"daily" row implies its in-orchestrator child + monthly jobs ran.

**Post-launch (Pro) plan:** split the daily orchestrator into grouped endpoints
(daily-financial / daily-comms / daily-engine, etc.) once on Pro — unnecessary on Hobby
(the 60s cap + I/O-not-CPU billing make the monolith correct for now). Queued separately:
monthly jobs self-reporting `cron_runs` (only when they fire) so silent month-end
non-execution becomes observable before the first pilot month-end.

---

