# RUNBOOK — Cost Observability Operations

> **Scope:** Day-to-day operational procedures for Pleks cost tracking (ADDENDUM_00H).
> **Audience:** Stéan (founder, sole operator — Phase 1). Expand when there's a team.
> **Last updated:** 2026-04-30

This runbook covers five operational scenarios that arise after ADDENDUM_00H is live:
monthly aggregate entry, FX rate updates, proration weight tuning, outlier org investigation,
and closed-month backfill.

---

## 1 · Monthly aggregate entry

**When:** at the start of each calendar month, after receiving invoices from Vercel and Supabase.

**What it is:** `MONTHLY_AGGREGATES` in `lib/observability/cost.ts` stores the raw infrastructure bills for each month. The snapshot builder prorates these across orgs relative to their activity. Without an entry for the current month, the builder falls back to the most recent known month — which is approximately right but not exact.

**Procedure:**

1. Get the bills:
   - **Vercel:** [vercel.com/dashboard](https://vercel.com/dashboard) → your account → Billing → Usage. Note the USD total for the closed month.
   - **Supabase:** [supabase.com/dashboard](https://supabase.com/dashboard) → org → Billing. Note the USD total.
   - **Better Stack + other fixed overhead:** estimate R550 for now; update if plans change.

2. Convert USD to ZAR cents:
   ```
   vercel_cents   = USD_amount × FX_USD_TO_ZAR_CENTS
   supabase_cents = USD_amount × FX_USD_TO_ZAR_CENTS
   ```
   For example, Vercel Pro $20 at R18.50/$ = R370 = 37 000 cents.

3. Open `lib/observability/cost.ts` and add a new entry to `MONTHLY_AGGREGATES`:
   ```ts
   // In lib/observability/cost.ts — MONTHLY_AGGREGATES
   "2026-06": {
     vercel_cents:          37_000,   // Vercel Pro $20 = R370
     supabase_cents:        46_250,   // Supabase Pro $25 = R462.50
     fixed_overhead_cents:  55_000,   // Better Stack + buffer ≈ R550
   },
   ```
   Add the new month **above** the previous month so the most recent entry is first.

4. Commit:
   ```bash
   git add lib/observability/cost.ts
   git commit -m "chore(cost): add 2026-06 monthly infrastructure aggregates"
   git push
   ```

5. Verify by triggering a manual snapshot rebuild (see §5 below) and checking the
   new month's rows appear in `/admin/platform-health`.

> **Note:** if you miss entering the aggregate before the cron runs on the 1st, the fallback
> is the previous month's values. The error is minor (~R0–50 total across all orgs) and
> is automatically corrected once the entry is added and the cron runs again.

---

## 2 · FX rate update

**When:** monthly (align with the aggregate entry above), or whenever the ZAR/USD rate shifts
more than ~5% from the current value. Source: [SARB exchange rates](https://www.resbank.co.za/en/home/what-we-do/statistics/rates/exchange-rates).

**What it affects:** every token-cost calculation in the `ai_usage` table is recorded at the
ZAR value at time of call (via `calculateAiCostCents`). The FX constant only affects future
calls — historical rows are immutable. Platform cost snapshots use the FX rate at build time,
so snapshots are re-calculated nightly anyway.

**Current value:** `FX_USD_TO_ZAR_CENTS = 1850` (R18.50 per USD).

**Procedure:**

1. Check the SARB rate or a reliable source (Bloomberg, XE.com).

2. Convert: multiply the ZAR/USD rate by 100 to get cents.
   Example: R18.92/$ → 1892 cents.

3. Update the constant in `lib/observability/cost.ts`:
   ```ts
   // Before:
   const FX_USD_TO_ZAR_CENTS = 1850
   // After:
   const FX_USD_TO_ZAR_CENTS = 1892
   ```

4. Also update the comment above it:
   ```ts
   // USD → ZAR in cents-per-dollar. R18.92/$ = 1892. Update monthly from SARB.
   ```

5. Run `npm run check` — no logic changes, so this should be clean.

6. Commit:
   ```bash
   git commit -m "chore(cost): update FX rate to R18.92/$ (2026-06)"
   ```

**Precision note:** a 10% rate swing (R18.50 → R20.35) changes a typical org's AI cost line
by ~10%. At current volumes (a few thousand tokens per day per org) this is under R5/month
per org. Precision matters at scale but is not critical at Phase 1.

---

## 3 · Proration weight tuning

**When:** when the proration allocation feels wrong — e.g. an org with only email activity
is absorbing a disproportionate share of Vercel/Supabase costs relative to a heavy AI user.

**What the weights do:** `PRORATION_WEIGHTS` in `lib/observability/cost.ts` assigns a
relative compute intensity to each event type. An org's share of shared infrastructure costs
is `orgActivity / totalPlatformActivity`, where activity is the weighted sum of its events.

**Current weights:**
```ts
export const PRORATION_WEIGHTS = {
  email:            1,
  whatsapp:        10,
  sms:              5,
  ai_call:        100,
  cron_invocation:  50,  // not yet wired — cron_runs has no org_id
}
```

**Interpretation:** one AI call is treated as equivalent to 100 email sends when allocating
shared infrastructure. This reflects that AI calls are CPU/memory-intensive and network-heavy
relative to email dispatch.

**When to retune:**

- If a low-activity org (e.g. 1 unit, no AI, 5 emails/month) is being allocated hundreds
  of rands in shared infrastructure: the `email` weight may be too high relative to `ai_call`.
- If a heavy AI org's snapshot looks disproportionately small: `ai_call` weight may be too low.
- Use the Supabase admin console to query actual event distributions before retuning — don't
  guess from one org's numbers.

**Procedure:**

1. Query current-month activity distribution:
   ```sql
   -- in Supabase SQL editor
   SELECT
     'email'    AS channel, SUM(email_count)     AS total FROM messaging_usage WHERE period = '2026-06'
   UNION ALL
   SELECT 'whatsapp', SUM(whatsapp_count)         FROM messaging_usage WHERE period = '2026-06'
   UNION ALL
   SELECT 'sms',      SUM(sms_count)              FROM messaging_usage WHERE period = '2026-06'
   UNION ALL
   SELECT 'ai_call',  COUNT(*)                    FROM ai_usage
     WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01' AND success = true;
   ```

2. Assess whether the mix looks right against the current weights.

3. Update weights in `lib/observability/cost.ts` and commit:
   ```bash
   git commit -m "chore(cost): retune proration weights — ai_call 100→80"
   ```

4. Trigger a manual snapshot rebuild (§5) to immediately reflect the new weights in the
   current month's rows. Historical frozen months are not recalculated on weight changes.

> **Caution:** weight changes affect all orgs simultaneously. If the platform has paying
> customers at Phase 2+, flag the change in the changelog so any billing disputes can
> reference the effective date.

---

## 4 · Outlier org investigation

**When:** the `/admin/platform-health` dashboard shows an org with an unusually high AI
cost line, or an org's `total_cost_cents` is negative (possible data issue), or a
monthly snapshot looks wrong relative to expectations.

**Investigation workflow:**

### 4a — Spot the outlier

Open `/admin/platform-health` (Pleks admin dashboard). The platform health page lists orgs
with their current-month cost breakdown. Sort by `ai_cost_cents` descending.

Alternatively, query directly:
```sql
SELECT
  o.name,
  pcs.period,
  pcs.ai_call_count,
  pcs.ai_cost_cents,
  pcs.total_cost_cents,
  pcs.email_count,
  pcs.wa_count
FROM platform_cost_snapshots pcs
JOIN organisations o ON o.id = pcs.org_id
WHERE pcs.period = '2026-06'
ORDER BY pcs.ai_cost_cents DESC
LIMIT 20;
```

### 4b — Drill into the org's AI usage

Navigate to `/admin/platform-health/[orgId]` for a per-org breakdown.

Or query `ai_usage` directly:
```sql
SELECT
  purpose,
  model,
  COUNT(*) AS calls,
  SUM(input_tokens)  AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cost_cents)    AS cost_cents_zar
FROM ai_usage
WHERE org_id = '<target-org-id>'
  AND created_at >= '2026-06-01'
  AND created_at < '2026-07-01'
  AND success = true
GROUP BY purpose, model
ORDER BY cost_cents_zar DESC;
```

Common causes of outlier AI costs:

| Symptom | Likely cause |
|---------|-------------|
| High `input_tokens` on `deposit_justification` | Org has many deductions — expected |
| High calls on `applicant_income_extraction` | Batch of application documents processed |
| High calls but low tokens | Many small triage calls — check `maintenance_triage` |
| Calls logged but `success = false` | API errors — check Sentry for the error pattern |

### 4c — Verify the snapshot is correct

If the snapshot `ai_cost_cents` for an org doesn't match the raw `ai_usage` sum, the
snapshot may be stale. Check when it was last updated:
```sql
SELECT updated_at FROM platform_cost_snapshots
WHERE org_id = '<target-org-id>' AND period = '2026-06';
```

If `updated_at` is more than 24 hours ago and the month is current, trigger a manual
snapshot rebuild (§5).

### 4d — If usage is unexpectedly high

1. Check whether the org's tier gate is correct:
   ```sql
   SELECT id, name, tier FROM organisations WHERE id = '<target-org-id>';
   ```
   AI features are gated at Steward tier. If a free-tier org has `ai_call_count > 0`,
   the gate may have been bypassed — investigate in Sentry.

2. Check for runaway loops (the same `lease_id` or `application_id` triggering
   repeated AI calls within a short window) by querying `ai_usage` with a tight
   time filter and grouping by `purpose` and the relevant entity ID.

3. If abuse is confirmed: contact the org owner. There is no automated cap at Phase 1.
   Flag for ADDENDUM_00I (rate limiting / spend caps).

---

## 5 · Closed-month backfill and manual rebuild

**When:** you need to rebuild a frozen historical month (e.g. to correct a data error),
or you want to force-rebuild the current month outside the nightly cron window.

**Closed-month policy:** `platform_cost_snapshots.frozen = true` marks a row as
immutable. The nightly cron never rewrites frozen rows. This is by design — once a month
is closed, the numbers should not change under an operator's feet.

### 5a — Force-rebuild the current month

Trigger the cron endpoint directly:
```bash
curl -H "x-cron-secret: $CRON_SECRET" \
  https://app.pleks.co.za/api/cron/cost-snapshots
```

Or, if running locally:
```bash
curl -H "x-cron-secret: $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/cost-snapshots
```

The handler calls `buildCostSnapshots({ period: new Date() })`, which only rebuilds
rows where `frozen = false` (the current month). Response: `{ ok: true, orgsProcessed: N }`.

### 5b — Backfill a closed month via SQL

The snapshot builder skips closed months when called normally. To rebuild a historical
month (e.g. to apply a proration weight correction retroactively), run in the Supabase
SQL editor:

```sql
-- Step 1: unfreeze the target month for all orgs
UPDATE platform_cost_snapshots
SET frozen = false
WHERE period = '2026-05';

-- Step 2: trigger cost-snapshots with force=true via the buildCostSnapshots function
-- (there is no HTTP flag for force — call the function directly in a migration or
--  a one-off Supabase Edge Function invocation with { force: true })

-- Step 3: re-freeze when done
UPDATE platform_cost_snapshots
SET frozen = true
WHERE period = '2026-05';
```

> **Warning:** unfreeze one month at a time. The snapshot builder uses `firstOfMonth(params.period)`
> and `nextMonth()` to scope the period — running it while multiple months are unfrozen may
> produce unexpected results if you pass the wrong `period` value.

### 5c — Delete and reimport a month from scratch

If the snapshot rows are corrupt (e.g. wrong org_id entries):
```sql
-- Hard delete — do this only if the rows are genuinely corrupt
DELETE FROM platform_cost_snapshots WHERE period = '2026-05';
-- Then trigger cost-snapshots with { period: '2026-05-01', force: true }
-- (requires a one-off code change or direct function call)
```

---

## 6 · Account ownership and access

### Cost data access

`platform_cost_snapshots` has **no client-side RLS SELECT policy** — all reads go through
the service-role client after `requireAdminAuth()` in `lib/admin/auth.ts`. The admin
`pleks_admin_token` cookie is the only way to read cost data in the UI.

**Admin login:** `https://app.pleks.co.za/admin/login` — password gate using
`ADMIN_PASSWORD` env var (Vercel → Settings → Environment Variables).

### Supabase service role

The `SUPABASE_SERVICE_ROLE_KEY` used by `createServiceClient()` has full DB access.
This key is in Vercel env vars (Production only — not Preview). If it is ever rotated:

1. Rotate in the Supabase dashboard → Project Settings → API → Service Role Key.
2. Update in Vercel → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY`.
3. Redeploy (Vercel picks up the new env var on the next deployment).
4. The key is also in `.env.local` on the dev machine — update that manually.

### Sentry cost-observability alerts

Sentry exceptions tagged `cron: cost-snapshots` surface snapshot failures. The
Sentry project is shared with all other Pleks alerts — no separate project needed.

Sentry dashboard: [sentry.io](https://sentry.io) → Pleks project → Issues.

---

*End of RUNBOOK_COST_OBSERVABILITY.md*
