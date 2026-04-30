/**
 * lib/observability/cost.ts — Pricing tables, cost math, and platform cost snapshot builder
 *
 * Auth:   Server-only — called from lib/ai/client.ts and app/api/cron/cost-snapshots/route.ts
 * Data:   ai_usage, messaging_usage, communication_log, organisations (read);
 *         platform_cost_snapshots (write via upsert)
 * Notes:  All monetary values are ZAR cents. USD prices converted at FX_USD_TO_ZAR_CENTS.
 *         Pricing constants live here — update when vendors adjust rates, then redeploy.
 *         subscription_charges table is not yet built (ADDENDUM_57F); revenue_cents = 0 until then.
 */
import { createServiceClient } from "@/lib/supabase/server"

// ── Anthropic token prices (USD cents per million tokens) ─────────────────────
// Source: https://docs.anthropic.com/en/docs/about-claude/models/overview
// Haiku 4.5:  $1 input / $5 output per 1M tokens
// Sonnet 4.6: $3 input / $15 output per 1M tokens
// Opus 4.7:   $15 input / $75 output per 1M tokens
// Cache reads: 0.1× input price; cache writes: 1.25× input price

interface ModelPricing {
  input_cents_per_mtok: number
  output_cents_per_mtok: number
  cache_read_cents_per_mtok: number
  cache_write_cents_per_mtok: number
}

const ANTHROPIC_PRICES: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": {
    input_cents_per_mtok:       100,
    output_cents_per_mtok:      500,
    cache_read_cents_per_mtok:   10,
    cache_write_cents_per_mtok: 125,
  },
  "claude-sonnet-4-6-20250514": {
    input_cents_per_mtok:       300,
    output_cents_per_mtok:     1500,
    cache_read_cents_per_mtok:   30,
    cache_write_cents_per_mtok: 375,
  },
  "claude-sonnet-4-6-20251001": {
    input_cents_per_mtok:       300,
    output_cents_per_mtok:     1500,
    cache_read_cents_per_mtok:   30,
    cache_write_cents_per_mtok: 375,
  },
  "claude-opus-4-7-20251001": {
    input_cents_per_mtok:      1500,
    output_cents_per_mtok:     7500,
    cache_read_cents_per_mtok:  150,
    cache_write_cents_per_mtok: 1875,
  },
}

const FALLBACK_MODEL_KEY = "claude-haiku-4-5-20251001"

// ── FX rate ───────────────────────────────────────────────────────────────────
// USD → ZAR in cents-per-dollar. R18.50/$ = 1850. Update monthly from SARB.
const FX_USD_TO_ZAR_CENTS = 1850

export function calculateAiCostCents(args: {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
}): number {
  const pricing = ANTHROPIC_PRICES[args.model] ?? ANTHROPIC_PRICES[FALLBACK_MODEL_KEY]!
  const inputUsdCents    = (args.input_tokens / 1_000_000) * pricing.input_cents_per_mtok
  const outputUsdCents   = (args.output_tokens / 1_000_000) * pricing.output_cents_per_mtok
  const cacheReadCents   = ((args.cache_read_tokens  ?? 0) / 1_000_000) * pricing.cache_read_cents_per_mtok
  const cacheWriteCents  = ((args.cache_write_tokens ?? 0) / 1_000_000) * pricing.cache_write_cents_per_mtok
  const totalUsdCents    = inputUsdCents + outputUsdCents + cacheReadCents + cacheWriteCents
  return Math.round(totalUsdCents * FX_USD_TO_ZAR_CENTS / 100)
}

// ── Per-unit direct costs (ZAR cents) ─────────────────────────────────────────
export const UNIT_COST_CENTS = {
  email_marginal: 1,    // ~R0.01 per email (Resend marginal above free tier)
  wa_message:   120,    // ~R1.20 per WhatsApp conversation (Africa's Talking)
  sms:           35,    // ~R0.35 per SMS
}

// ── Shared-infrastructure proration weights ───────────────────────────────────
// Reflect approximate compute intensity per event. See D-COST-02.
export const PRORATION_WEIGHTS = {
  email:            1,
  whatsapp:        10,
  sms:              5,
  ai_call:        100,
  cron_invocation:  50,
}

// ── Monthly infrastructure aggregates (manually entered from bills) ───────────
// Format: 'YYYY-MM': { vercel_cents, supabase_cents, fixed_overhead_cents }
// Add a new entry at the start of each month. See RUNBOOK_COST_OBSERVABILITY.md.
export const MONTHLY_AGGREGATES: Record<string, {
  vercel_cents: number
  supabase_cents: number
  fixed_overhead_cents: number
}> = {
  "2026-04": {
    vercel_cents:           37_000,   // Vercel Pro $20 = R370
    supabase_cents:         46_250,   // Supabase Pro $25 = R462.50
    fixed_overhead_cents:   55_000,   // Better Stack + buffer ≈ R550
  },
  "2026-05": {
    vercel_cents:           37_000,
    supabase_cents:         46_250,
    fixed_overhead_cents:   55_000,
  },
}

export function getMonthlyAggregate(period: Date): {
  vercel_cents: number
  supabase_cents: number
  fixed_overhead_cents: number
} {
  const key = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}`
  const found = MONTHLY_AGGREGATES[key]
  if (found) return found
  // Fall back to most recent known month
  const keys = Object.keys(MONTHLY_AGGREGATES).sort()
  const last = keys[keys.length - 1]
  return MONTHLY_AGGREGATES[last] ?? { vercel_cents: 37_000, supabase_cents: 46_250, fixed_overhead_cents: 55_000 }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function nextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}

function isSameMonthUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

export async function buildCostSnapshots(params: {
  period: Date
  force?: boolean
}): Promise<{ orgsProcessed: number; totalSpendCents: number }> {
  const db = await createServiceClient()
  const periodStart = firstOfMonth(params.period)
  const periodEnd   = nextMonth(periodStart)
  const isCurrentMonth = isSameMonthUTC(periodStart, new Date())

  if (!isCurrentMonth && !params.force) {
    return { orgsProcessed: 0, totalSpendCents: 0 }
  }

  const periodStr    = periodStart.toISOString().slice(0, 10)
  const periodEndStr = periodEnd.toISOString().slice(0, 10)

  // Fetch per-org counts from source tables
  const [messagingRows, aiRows, orgRows] = await Promise.all([
    fetchMessagingUsage(db, periodStr),
    fetchAiUsageByOrg(db, periodStart.toISOString(), periodEndStr),
    fetchActiveOrgs(db),
  ])

  // Total platform activity (for proration denominator)
  let totalActivity = 0
  for (const org of orgRows) {
    const mu  = messagingRows.get(org.id)
    const ai  = aiRows.get(org.id)
    totalActivity +=
      (mu?.email_count     ?? 0) * PRORATION_WEIGHTS.email       +
      (mu?.whatsapp_count  ?? 0) * PRORATION_WEIGHTS.whatsapp    +
      (mu?.sms_count       ?? 0) * PRORATION_WEIGHTS.sms         +
      (ai?.call_count      ?? 0) * PRORATION_WEIGHTS.ai_call
  }

  const agg = getMonthlyAggregate(periodStart)

  const rows = orgRows.map(org => {
    const mu    = messagingRows.get(org.id)
    const ai    = aiRows.get(org.id)
    const emails    = mu?.email_count    ?? 0
    const wa        = mu?.whatsapp_count ?? 0
    const sms       = mu?.sms_count      ?? 0
    const aiCalls   = ai?.call_count     ?? 0
    const aiInput   = ai?.input_tokens   ?? 0
    const aiOutput  = ai?.output_tokens  ?? 0
    const aiCost    = ai?.cost_cents     ?? 0

    const orgActivity =
      emails  * PRORATION_WEIGHTS.email    +
      wa      * PRORATION_WEIGHTS.whatsapp +
      sms     * PRORATION_WEIGHTS.sms      +
      aiCalls * PRORATION_WEIGHTS.ai_call

    const share      = totalActivity > 0 ? orgActivity / totalActivity : 0
    const allocVercel    = Math.round(agg.vercel_cents    * share)
    const allocSupabase  = Math.round(agg.supabase_cents  * share)
    const allocFixed     = Math.round(agg.fixed_overhead_cents / Math.max(orgRows.length, 1))

    const emailCost = emails * UNIT_COST_CENTS.email_marginal
    const waCost    = wa     * UNIT_COST_CENTS.wa_message
    const smsCost   = sms    * UNIT_COST_CENTS.sms
    const totalCost = emailCost + waCost + smsCost + aiCost + allocVercel + allocSupabase + allocFixed

    return {
      org_id:                          org.id,
      period:                          periodStr,
      email_count:                     emails,
      email_cost_cents:                emailCost,
      wa_count:                        wa,
      wa_cost_cents:                   waCost,
      sms_count:                       sms,
      sms_cost_cents:                  smsCost,
      ai_call_count:                   aiCalls,
      ai_input_tokens:                 aiInput,
      ai_output_tokens:                aiOutput,
      ai_cost_cents:                   aiCost,
      allocated_vercel_cents:          allocVercel,
      allocated_supabase_cents:        allocSupabase,
      allocated_fixed_overhead_cents:  allocFixed,
      total_cost_cents:                totalCost,
      revenue_cents:                   0,         // ADDENDUM_57F not yet built
      gross_margin_cents:              0 - totalCost,
      last_user_login_at:              org.last_login_at,
      active_leases:                   org.active_leases,
      cron_invocations_for_org:        0,         // cron_runs has no org_id
      frozen:                          false,
      updated_at:                      new Date().toISOString(),
    }
  })

  for (const row of rows) {
    const { error } = await db
      .from("platform_cost_snapshots")
      .upsert(row, { onConflict: "org_id,period" })
    if (error) console.error("[cost-snapshots] upsert failed:", error.message)
  }

  const totalSpend = rows.reduce((a, r) => a + r.total_cost_cents, 0)
  return { orgsProcessed: rows.length, totalSpendCents: totalSpend }
}

// ── Source data fetchers ──────────────────────────────────────────────────────

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

async function fetchMessagingUsage(
  db: ServiceClient,
  period: string,
): Promise<Map<string, { email_count: number; whatsapp_count: number; sms_count: number }>> {
  const { data, error } = await db
    .from("messaging_usage")
    .select("org_id, email_count, whatsapp_count, sms_count")
    .eq("period", period)
  if (error) {
    console.error("[cost-snapshots] fetchMessagingUsage failed:", error.message)
    return new Map()
  }
  return new Map((data ?? []).map(r => [
    r.org_id as string,
    {
      email_count:    (r.email_count    as number) ?? 0,
      whatsapp_count: (r.whatsapp_count as number) ?? 0,
      sms_count:      (r.sms_count      as number) ?? 0,
    },
  ]))
}

async function fetchAiUsageByOrg(
  db: ServiceClient,
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, { call_count: number; input_tokens: number; output_tokens: number; cost_cents: number }>> {
  // Uses get_ai_usage_agg_by_org() RPC so PostgreSQL aggregates before returning —
  // avoids the PostgREST 1,000-row default that would silently truncate high-volume orgs.
  const { data, error } = await db.rpc("get_ai_usage_agg_by_org", {
    p_start: periodStart,
    p_end:   periodEnd,
  })
  if (error) {
    console.error("[cost-snapshots] fetchAiUsageByOrg failed:", error.message)
    return new Map()
  }

  return new Map((data ?? []).map((row: {
    org_id: string; call_count: number; input_tokens: number; output_tokens: number; cost_cents: number
  }) => [
    row.org_id,
    {
      call_count:    Number(row.call_count),
      input_tokens:  Number(row.input_tokens),
      output_tokens: Number(row.output_tokens),
      cost_cents:    Number(row.cost_cents),
    },
  ]))
}

async function fetchActiveOrgs(
  db: ServiceClient,
): Promise<Array<{ id: string; last_login_at: string | null; active_leases: number }>> {
  const { data, error } = await db
    .from("organisations")
    .select("id")
  if (error) {
    console.error("[cost-snapshots] fetchActiveOrgs failed:", error.message)
    return []
  }
  // Count active leases per org
  const { data: leaseData, error: leaseError } = await db
    .from("leases")
    .select("org_id")
    .eq("status", "active")
  if (leaseError) console.error("[cost-snapshots] fetchActiveLeases failed:", leaseError.message)

  const leaseCounts = new Map<string, number>()
  for (const row of leaseData ?? []) {
    const oid = row.org_id as string
    leaseCounts.set(oid, (leaseCounts.get(oid) ?? 0) + 1)
  }

  return (data ?? []).map(org => ({
    id:            org.id as string,
    last_login_at: null,  // auth_events query added when BUILD_62 ships
    active_leases: leaseCounts.get(org.id as string) ?? 0,
  }))
}
