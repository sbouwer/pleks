"use server"

/**
 * app/(dashboard)/settings/compliance/screeningPolicyActions.ts — read/set the org's company-surety pooling rule.
 *
 * Auth:   read via gateway() (any member); set via requireAgentWriteAccess (the write chokepoint). screening_policies
 *         rows are IMMUTABLE — "setting" inserts a NEW version (newest wins) preserving the prior policy's other
 *         fields. The legal BOUNDS are enforced in companyRuling regardless (the execution gate), so a liberal
 *         config only bites post-signing — this is the operational default, not a way to bypass the bounds (14P §5).
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { resolvePoolingRule } from "@/lib/screening/screeningPolicy"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { PoolingRule } from "@/lib/applications/companyRuling"

const VALID: readonly PoolingRule[] = ["strongestSingle", "combined", "suretyGroupPooled"]

export async function getCompanyPoolingRule(): Promise<PoolingRule> {
  const gw = await gateway()
  if (!gw) return "strongestSingle"
  return resolvePoolingRule(gw.db, gw.orgId)
}

export async function setCompanyPoolingRule(rule: PoolingRule): Promise<{ ok: boolean; error?: string }> {
  if (!VALID.includes(rule)) return { ok: false, error: "Invalid rule" }
  const gw = await requireAgentWriteAccess("set_screening_policy")
  const { db, orgId, userId } = gw
  // Preserve the current policy's other fields (e.g. affordability_threshold) — insert a NEW immutable version.
  const { data: latest, error: readErr } = await db
    .from("screening_policies").select("policy")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("setCompanyPoolingRule read", readErr)
  const base = (latest?.policy as Record<string, unknown> | null) ?? {}
  const version = `org-pooling-${new Date().toISOString()}`
  const { data: row, error: insErr } = await db
    .from("screening_policies")
    .insert({ org_id: orgId, version, policy: { ...base, source: "org", pooling_rule: rule }, created_by: userId })
    .select("id").single()
  logQueryError("setCompanyPoolingRule insert", insErr)
  if (insErr || !row) return { ok: false, error: "Could not save the policy." }
  await recordAudit(db, { orgId, actorId: userId, action: "UPDATE", table: "screening_policies", recordId: row.id as string, after: { pooling_rule: rule } })
  return { ok: true }
}
