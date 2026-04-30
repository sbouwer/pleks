# RUNBOOK — Uptime Monitoring Operations

> **Scope:** Day-to-day operational procedures for Pleks uptime monitoring (ADDENDUM_00G).
> **Audience:** Stéan (founder, sole operator — Phase 1). Expand when there's a team.
> **Last updated:** 2026-04-30

This runbook covers the five operational scenarios that arise after ADDENDUM_00G is live:
token rotation, planned maintenance, manual incident management, alert triage, and account ownership.

---

## 1 · Token rotation — `HEALTH_PROBE_TOKEN`

**When:** annually (add a calendar reminder for the same month each year), or immediately after a suspected credential exposure.

**What it protects:** the `/api/health/deep` endpoint, which returns component-level status including DB latency, email reachability, and cron freshness. A leaked token enables information disclosure but no direct exploit — no user data is surfaced, and the endpoint is read-only. Rotation is standard hygiene.

**Procedure:**

1. Generate a new token locally:
   ```bash
   openssl rand -hex 32
   ```

2. Update in Vercel:
   - Go to the Pleks project in Vercel → Settings → Environment Variables.
   - Update `HEALTH_PROBE_TOKEN` in **Production** (and Preview if you use the deep probe there).
   - Save.

3. Update in Better Stack:
   - Open the Better Stack dashboard → Monitors → "Deep probe monitor".
   - Edit the monitor URL: replace the old token value in the `?token=` query parameter with the new token.
   - Save.

4. Trigger a redeploy in Vercel (the new token must be baked into the running deployment):
   - Vercel dashboard → Deployments → Redeploy latest production deployment.
   - Or push a trivial commit to trigger CI/CD.

5. Verify:
   ```bash
   curl -I "https://app.pleks.co.za/api/health/deep?token=<NEW_TOKEN>"
   # Expected: HTTP 200
   curl -I "https://app.pleks.co.za/api/health/deep?token=<OLD_TOKEN>"
   # Expected: HTTP 401
   ```

6. Confirm Better Stack resumes green on the deep probe monitor (may take up to 5 minutes for the next probe cycle).

**Downtime window:** zero. The old monitor (still using the old token) returns 401 during the window between Vercel redeploy and Better Stack URL update. A 401 is not "app down" — it is "auth changed." Better Stack will alert on the 401 only if you have configured it to treat 401 as a failure; by default the deep probe expects 200, so it will briefly amber. The shallow product monitor (`/api/health`, no token) is unaffected throughout.

---

## 2 · Planned maintenance

**Scenario:** you are about to disable, modify, or redeploy a cron, or take a brief service window (e.g. a database migration), and you want to prevent false-alarm alerts.

### 2a — Pausing heartbeat monitors

Before disabling a cron:

1. Open Better Stack → Monitors → Heartbeats.
2. Find the relevant heartbeat(s) — e.g. `daily-heartbeat` if you're taking the whole orchestrator offline.
3. Click **Pause** on each affected heartbeat. Better Stack will not alert on missed pings while paused.
4. Perform your maintenance.
5. Re-enable the cron.
6. Confirm the cron runs successfully (check Vercel function logs for the relevant route).
7. **Unpause** the heartbeat monitors in Better Stack.

> If you forget to unpause: Better Stack will silently not alert on future misses. Check the Heartbeats dashboard after every maintenance window and confirm all monitors are in "Active" state.

### 2b — Pausing HTTP uptime monitors

Before taking a planned outage (e.g. a zero-downtime deploy that you know will cause a brief 502 blip):

1. Better Stack → Monitors → HTTP monitors.
2. Pause the **Product monitor** (`app.pleks.co.za/api/health`) and the **Deep probe monitor**.
3. Leave the Marketing monitor running unless the marketing site is also affected.
4. Perform your deploy / maintenance.
5. Verify the app is healthy:
   ```bash
   curl https://app.pleks.co.za/api/health
   # Expected: {"status":"ok", ...}
   ```
6. Unpause all paused monitors in Better Stack.

**Typical Vercel deploy:** Vercel performs zero-downtime deploys via atomic swap; pausing monitors is usually unnecessary. Only pause if you know the deploy will cause a hard outage (e.g. a migration that takes the DB offline briefly, or a breaking schema change).

---

## 3 · Manual incidents

**Scenario:** something is broken, customers may be affected, and you need to communicate status on `pleks.co.za/status`.

### 3a — Opening an incident in Better Stack

1. Better Stack dashboard → Incidents → **New incident**.
2. Fill in:
   - **Title:** short, customer-facing. Use the vague-but-honest template: "We are investigating a service disruption."
   - **Affected monitors:** select the monitors that are down or degraded.
   - **Status:** "Investigating" to start.
3. Save. The incident appears in Better Stack's internal log.

### 3b — Writing the customer-facing status page entry

The public status page at `pleks.co.za/status` reads from the Better Stack API (`/api/v2/incidents`). The `cause` field in Better Stack maps to the `summary` field shown on the status page.

**Tone guide (per ADDENDUM_00G D-UP-14):** vague is kinder. Customers do not need to know which specific subsystem failed. Recommended phrasing:

- "We are investigating a service disruption affecting [feature area]." — during an active incident
- "We are experiencing elevated response times on [feature area]. Most operations are completing normally." — degraded (not full outage)
- "The issue has been resolved. All systems are now operating normally." — on resolution

Do NOT include:
- Database error codes (e.g. `42P01`, `PGRST116`)
- Stack trace fragments
- Internal service names (Supabase, Resend, Vercel function names)
- Estimated data loss or affected record counts

### 3c — Updating and resolving

As the incident progresses, update the Better Stack incident with a new message. When resolved:

1. Set Better Stack incident status to **Resolved**.
2. Update the `cause` / summary with a post-resolution note: "Resolved at [time SAST]. Root cause: [one sentence, internal]. No data loss."
3. The status page will reflect resolved status within 60 seconds (ISR revalidation).

The `Incident` interface in `lib/observability/health.ts` defines the shape that `app/api/status/route.ts` uses to render incident history.

---

## 4 · Alert triage

Better Stack sends alert emails when a monitor transitions to down or degraded. Here is what each alert means and the first-response action.

### Daily heartbeat miss (`daily-heartbeat`)

**Meaning:** the daily cron orchestrator at `app/api/cron/daily` did not complete successfully at its 05:00 UTC run.

**First response:**
1. Open Vercel dashboard → Functions → search for `api/cron/daily`.
2. Check the 05:00 UTC invocation log. Common causes:
   - Vercel cron not scheduled (check `vercel.json` cron config is intact after the last deploy).
   - `CRON_SECRET` env var missing or mismatched (function returns 401 and exits without writing to `cron_runs`).
   - A job early in the sequence threw an uncaught exception that prevented `cron_runs` from being marked `completed`.
3. If the orchestrator ran but one sub-job failed: check Sentry for exceptions tagged `cron_job`.
4. Re-run manually if needed:
   ```bash
   curl -H "x-cron-secret: $CRON_SECRET" https://app.pleks.co.za/api/cron/daily
   ```

### Arrears-sequence heartbeat miss

**Meaning:** the `arrears-sequence` cron did not ping Better Stack at its expected interval.

**First response:** check whether the orchestrator ran (the `daily` heartbeat is the primary signal). If the orchestrator ran but arrears-sequence did not complete, check Vercel logs for the arrears-sequence handler and Sentry for exceptions tagged `cron_job: arrears_sequence`.

### Invoice-generate / billing-cascade heartbeat miss

Same pattern as arrears-sequence above — check orchestrator first, then the individual job handler logs and Sentry.

### Cost-snapshots heartbeat miss (if configured)

**Meaning:** the `cost-snapshots` job did not complete at its expected time (06:30 UTC, or whichever schedule it runs on). This is **non-critical** — cost snapshots are for internal dashboards, not customer-facing operations.

**First response:** check the 06:30 UTC run in Vercel logs. If the function errored, check Sentry. This alert can wait until business hours if it arrives overnight.

### HTTP uptime probe down (product or marketing monitor)

**Meaning:** `https://app.pleks.co.za/api/health` (or `https://pleks.co.za`) returned a non-200 or did not respond from multiple regions for 2+ consecutive checks.

**First response:**
1. Open `https://app.pleks.co.za/api/health` in a browser. If it loads: likely a transient multi-region blip; watch for recovery.
2. Check Vercel dashboard → Deployments. Is the latest deployment healthy? A failed deploy can leave the app in a broken state.
3. Check Vercel → Functions logs for runtime errors (500s, timeouts).
4. If Vercel looks healthy, check Cloudflare (if behind Cloudflare) for a WAF block or edge caching issue.

### Deep probe degraded (`/api/health/deep` returns `"status":"degraded"`)

**Meaning:** the DB is up (aggregate is not `down`), but at least one non-critical component — email (Resend), file storage (Supabase Storage), or scheduled jobs (`crons`) — is reporting degraded.

**First response:**
1. Fetch the deep probe directly to see which component is degraded:
   ```bash
   curl "https://app.pleks.co.za/api/health/deep?token=$HEALTH_PROBE_TOKEN"
   ```
2. Check Vercel function logs for lines prefixed `[health]` — these are logged by `health.ts` on component failures.
3. Per component:
   - `email: degraded` → check Resend status at `status.resend.com`. Check `RESEND_API_KEY` env var in Vercel.
   - `storage: degraded` → check Supabase status at `status.supabase.com`. Storage calls use the service role client.
   - `crons: degraded` → one or more of `TRACKED_DAILY_JOBS` has not had a successful run in >48h. Check which jobs are listed in `stale_jobs` in the probe response, then check Vercel cron logs.

---

## 5 · Account ownership

### Better Stack account

**Owner:** Stéan Bouwer (`bouwer.stean@gmail.com`).

**API key location:** Vercel environment variable `BETTERSTACK_API_KEY` (Production). Also in `.env.local` on Stéan's dev machine.

**Dashboard login:** `https://uptime.betterstack.com` — login via Google (bouwer.stean@gmail.com).

**Heartbeat URLs:** stored as Vercel environment variables:
- `HEARTBEAT_DAILY` — orchestrator heartbeat
- `HEARTBEAT_ARREARS_SEQUENCE`
- `HEARTBEAT_INVOICE_GENERATE`
- `HEARTBEAT_BILLING_CASCADE`

These URLs are also visible in the Better Stack Heartbeats dashboard if the env vars are ever lost.

### Recovery path if founder is unavailable

> **TODO:** fill this in when Pleks has a second team member with operational access.

For now: if Stéan is unavailable and an incident occurs:

1. Better Stack monitors continue to run passively and log incident history — no action needed to preserve data.
2. The Pleks app continues to operate independently of Better Stack — uptime monitoring going silent does not affect the product.
3. Customer-facing status page (`pleks.co.za/status`) will show last-cached state (up to 60 seconds old) without intervention.
4. To open a Better Stack account, a second operator would need Google OAuth access to `bouwer.stean@gmail.com` or a password-based login added to the Better Stack team settings.

**Recommended action when a second team member joins:** add them to the Better Stack account under Team → Members, grant "Member" role (can acknowledge incidents and pause monitors but cannot delete monitors or rotate billing). Document their name here.

---

*End of RUNBOOK_UPTIME.md*
