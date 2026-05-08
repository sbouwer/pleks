/**
 * lib/rules/compliance/fica-expiry.ts — FICA document expiry alert rule
 *
 * Scope:    org · daily · cooldown: 7d (all tiers)
 * Notes:    Alerts when any tenant document with a period_to date is expiring within
 *           30 days. Covers passports, work permits, and any other time-limited identity
 *           document the agent has uploaded to tenant_documents. SA green/smart IDs have
 *           no period_to and are never surfaced.
 *
 *           Landlord FICA gap: FICA obligations apply to both sides of the relationship
 *           (FICA s21 — agents must verify both tenant and landlord identity). Landlord
 *           documents are not tracked in a dedicated table in the current schema — they
 *           have no landlord_documents equivalent. This rule covers tenant_documents only
 *           until landlord document storage is implemented. property_documents.expiry_date
 *           covers property compliance certificates (electrical, fire, gas) — a separate
 *           compliance obligation, not FICA identity verification.
 *
 *           Org-level cooldown prevents daily noise — at most one alert per org per week
 *           even if multiple documents are near expiry. All expiring docs for the org are
 *           surfaced in a single payload.
 */
import type { OrgRule, RuleActionResult } from "../types"

const RULE_ID    = "fica-expiry"
const ALERT_DAYS = 30

type ExpiringDoc = {
  id:            string
  tenant_id:     string
  document_type: string
  name:          string
  period_to:     string
}

export const ficaExpiryRule: OrgRule = {
  id:           RULE_ID,
  domain:       "compliance",
  description:  "Alert agent when tenant FICA documents expire within 30 days — PPRA/FICA obligation",
  scope:        "org",
  frequency:    "daily",
  cooldownDays: 7,
  tags:         ["fica", "compliance", "ppra", "documents"],

  async condition({ supabase, org, now }) {
    const today      = now.toISOString().split("T")[0]
    const cutoff     = new Date(now)
    cutoff.setDate(cutoff.getDate() + ALERT_DAYS)
    const cutoffDate = cutoff.toISOString().split("T")[0]

    const { count, error } = await supabase
      .from("tenant_documents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .not("period_to", "is", null)
      .gt("period_to", today)
      .lte("period_to", cutoffDate)

    if (error) {
      console.error(`[${RULE_ID}] condition query failed:`, error.message)
      return false
    }
    return (count ?? 0) > 0
  },

  async action({ supabase, org, now }): Promise<RuleActionResult> {
    const today      = now.toISOString().split("T")[0]
    const cutoff     = new Date(now)
    cutoff.setDate(cutoff.getDate() + ALERT_DAYS)
    const cutoffDate = cutoff.toISOString().split("T")[0]

    const { data: docs, error } = await supabase
      .from("tenant_documents")
      .select("id, tenant_id, document_type, name, period_to")
      .eq("org_id", org.id)
      .not("period_to", "is", null)
      .gt("period_to", today)
      .lte("period_to", cutoffDate)
      .order("period_to", { ascending: true })

    if (error || !docs?.length) return { summary: "No expiring documents found", count: 0 }

    const expiring = docs as ExpiringDoc[]

    return {
      summary: `${expiring.length} FICA document(s) expiring within ${ALERT_DAYS} days`,
      count:   expiring.length,
      data: {
        documents: expiring.map(d => ({
          id:            d.id,
          tenant_id:     d.tenant_id,
          document_type: d.document_type,
          name:          d.name,
          expires:       d.period_to,
        })),
      },
    }
  },
}
