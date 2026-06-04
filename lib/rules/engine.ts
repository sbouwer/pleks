/**
 * lib/rules/engine.ts — Rules engine orchestrator
 *
 * Auth:   Called by daily cron (service role client passed in)
 * Notes:  Two deduplication patterns — see BUILD_67_RULES_ENGINE.md §Idempotency.
 *         Org-level cooldown: cooldownDays on rule definition, checked via rule_runs.
 *         Entity-level: hasBeenActionedFor() called inside rule condition/action.
 */
import * as Sentry from "@sentry/nextjs"
import type { SupabaseClient } from "@supabase/supabase-js"
import { RULE_REGISTRY } from "./registry"
import type {
  OrgRule,
  PlatformRule,
  OrgRuleContext,
  PlatformRuleContext,
  RuleActionResult,
  SubscriptionTier,
} from "./types"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isInCooldown(
  supabase: SupabaseClient,
  ruleId: string,
  orgId: string,
  cooldownDays: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000).toISOString()
  const { data, error: queryError } = await supabase
    .from("rule_runs")
    .select("id")
    .eq("rule_id", ruleId)
    .eq("org_id", orgId)
    .eq("outcome", "actioned")
    .gte("evaluated_at", cutoff)
    .limit(1)
    .maybeSingle()
    logQueryError("isInCooldown rule_runs", queryError)
  return !!data
}

async function writeRuleRun(
  supabase: SupabaseClient,
  ruleId: string,
  orgId: string | null,
  condition: string,
  outcome: string,
  payload: unknown,
  durationMs: number,
): Promise<void> {
  const { error } = await supabase.from("rule_runs").insert({
    rule_id:     ruleId,
    org_id:      orgId,
    condition,
    outcome,
    payload,
    duration_ms: durationMs,
  })
  if (error) console.error(`[rules/engine] writeRuleRun failed for ${ruleId}:`, error.message)
}

// ── Entity-level deduplication helper (exported for use in rule conditions) ───

/**
 * Returns true if this rule has already been actioned for the given entity
 * (identified by entity_id in rule_runs.payload) within the optional time window.
 * Rules that use per-entity dedup must include entity_id in their action's data.
 */
export async function hasBeenActionedFor(
  supabase: SupabaseClient,
  ruleId: string,
  entityId: string,
  since?: Date,
): Promise<boolean> {
  let query = supabase
    .from("rule_runs")
    .select("id", { head: true, count: "exact" })
    .eq("rule_id", ruleId)
    .eq("outcome", "actioned")
    .contains("payload", { entity_id: entityId })
  if (since) query = query.gte("evaluated_at", since.toISOString())
  const { count } = await query
  return (count ?? 0) > 0
}

// ── Org rule evaluation ───────────────────────────────────────────────────────

async function evaluateOrgRule(
  rule: OrgRule,
  ctx: OrgRuleContext,
): Promise<{ outcome: string }> {
  const start = Date.now()

  if (rule.tiers && !rule.tiers.includes(ctx.tier)) {
    await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "met", "tier_gated", null, Date.now() - start)
    return { outcome: "tier_gated" }
  }

  if (rule.requiresActive && !ctx.isActive) {
    await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "met", "sub_gated", null, Date.now() - start)
    return { outcome: "sub_gated" }
  }

  let conditionMet: boolean
  try {
    conditionMet = await rule.condition(ctx)
  } catch (err) {
    ctx.log(`[${rule.id}] condition error`, err)
    Sentry.captureException(err, { tags: { rule_id: rule.id, org_id: ctx.org.id } })
    await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "error", "error", { error: String(err) }, Date.now() - start)
    return { outcome: "error" }
  }

  if (!conditionMet) {
    await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "not_met", "no_op", null, Date.now() - start)
    return { outcome: "no_op" }
  }

  if (rule.cooldownDays) {
    const inCooldown = await isInCooldown(ctx.supabase, rule.id, ctx.org.id, rule.cooldownDays)
    if (inCooldown) {
      await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "met", "cooldown", null, Date.now() - start)
      return { outcome: "cooldown" }
    }
  }

  let result: RuleActionResult
  try {
    result = await rule.action(ctx)
  } catch (err) {
    ctx.log(`[${rule.id}] action error`, err)
    Sentry.captureException(err, { tags: { rule_id: rule.id, org_id: ctx.org.id } })
    await writeRuleRun(ctx.supabase, rule.id, ctx.org.id, "met", "error", { error: String(err) }, Date.now() - start)
    return { outcome: "error" }
  }

  await writeRuleRun(
    ctx.supabase, rule.id, ctx.org.id,
    "met", "actioned",
    result.data ?? { summary: result.summary },
    Date.now() - start,
  )
  return { outcome: "actioned" }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export type EngineRuleSummary = { orgs_evaluated: number; actioned: number; errors: number }

export async function runRulesEngine(
  supabase: SupabaseClient,
  frequency: "daily" | "weekly" | "monthly",
  now: Date,
): Promise<Record<string, EngineRuleSummary>> {
  const summary: Record<string, EngineRuleSummary> = {}
  const log = (msg: string, data?: unknown) => console.log(msg, data ?? "")

  const rules = RULE_REGISTRY.filter(r => r.frequency === frequency)

  // Platform rules
  const platformRules = rules.filter((r): r is PlatformRule => r.scope === "platform")
  for (const rule of platformRules) {
    const ctx: PlatformRuleContext = { supabase, now, log }
    const start = Date.now()
    try {
      const conditionMet = await rule.condition(ctx)
      if (!conditionMet) {
        await writeRuleRun(supabase, rule.id, null, "not_met", "no_op", null, Date.now() - start)
        summary[rule.id] = { orgs_evaluated: 0, actioned: 0, errors: 0 }
        continue
      }
      const result = await rule.action(ctx)
      await writeRuleRun(supabase, rule.id, null, "met", "actioned", result.data ?? { summary: result.summary }, Date.now() - start)
      summary[rule.id] = { orgs_evaluated: 0, actioned: 1, errors: 0 }
    } catch (err) {
      log(`[${rule.id}] platform rule error`, err)
      Sentry.captureException(err, { tags: { rule_id: rule.id } })
      await writeRuleRun(supabase, rule.id, null, "error", "error", { error: String(err) }, Date.now() - start)
      summary[rule.id] = { orgs_evaluated: 0, actioned: 0, errors: 1 }
    }
  }

  // Org rules
  const orgRules = rules.filter((r): r is OrgRule => r.scope === "org")
  if (!orgRules.length) return summary

  const { data: orgs, error: orgsErr } = await supabase
    .from("organisations")
    .select("id, name, type")
    .is("deleted_at", null)

  if (orgsErr) {
    console.error("[rules/engine] failed to fetch orgs:", orgsErr.message)
    return summary
  }

  for (const org of orgs ?? []) {
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("org_id", org.id)
      .not("status", "eq", "purged")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    logQueryError("runRulesEngine subscriptions", subError)

    const tier = ((sub?.tier ?? "owner") as SubscriptionTier)
    const isActive = sub ? ["active", "trialing"].includes(sub.status) : true

    const ctx: OrgRuleContext = {
      supabase,
      org,
      sub: sub ?? null,
      tier,
      isActive,
      now,
      log: (msg, data) => log(`[${org.name}] ${msg}`, data),
    }

    for (const rule of orgRules) {
      if (!summary[rule.id]) summary[rule.id] = { orgs_evaluated: 0, actioned: 0, errors: 0 }
      summary[rule.id].orgs_evaluated++

      const { outcome } = await evaluateOrgRule(rule, ctx)
      if (outcome === "actioned") summary[rule.id].actioned++
      if (outcome === "error")    summary[rule.id].errors++
    }
  }

  return summary
}
