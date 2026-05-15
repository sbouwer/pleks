/**
 * app/(dashboard)/settings/privacy/retention/page.tsx — Org retention policies view (read-only v1)
 *
 * Route:  /settings/privacy/retention
 * Auth:   gatewaySSR() — org member
 * Data:   getRetentionPolicies(orgId) — D-POPIA-02 defaults (per-agency override is Tier 2)
 * Notes:  Read-only in v1. Per-agency retention override deferred (would require auditing
 *         every agency's bespoke schedule). Display shows legal basis per category.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getRetentionPolicies, isErasableNow } from "@/lib/popia/retention"
import { RetentionDashboard } from "@/components/popia/RetentionDashboard"
import type { DataCategory } from "@/lib/popia/retention"

export const metadata = { title: "Data retention" }

export default async function RetentionPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { orgId } = gw

  const snapshot = await getRetentionPolicies(orgId)
  const now = new Date()

  const rows = await Promise.all(
    (Object.keys(snapshot.policies) as DataCategory[]).map(async (category) => ({
      category,
      decision: await isErasableNow(category, { orgId, created_at: now }),
    })),
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Data retention</h1>
        <p className="text-sm text-muted-foreground">
          Retention periods are set by POPIA and the applicable SA legislation per data category.
          Per-agency overrides are not supported in v1 — changes require a POPIA impact assessment.
        </p>
      </div>

      <RetentionDashboard rows={rows} />
    </div>
  )
}
