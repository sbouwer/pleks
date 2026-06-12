/**
 * lib/settings/overview.ts — the settings "smart overview" health resolver
 *
 * Auth:   called from the settings Overview (server component) with the gateway db + orgId
 * Data:   subscriptions (tier/trial), organisations via fetchOrgSettings (branding), user_orgs (team)
 * Notes:  Derives the Overview's "Set up" (not yet done — vanishes as completed) and "Needs action"
 *         (configured but flagged) items from real state — never hardcoded, never click-dismissed. Every
 *         signal is a LIVE check (count/column/status) re-run on each load, so a card disappears the
 *         moment its underlying state changes regardless of HOW (add a property anywhere → the "Add a
 *         property" card is gone next render). Icons are returned as string names (server→client safe);
 *         the renderer maps them. Add signals here as new state becomes readable (2FA, FICA, payment…).
 *         "Frequently used" is rendered separately (usage tracking, later).
 */
import { fetchOrgSettings } from "@/lib/comms/send-email"
import { getEffectiveTier } from "@/lib/tier/effectiveTier"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { createServiceClient } from "@/lib/supabase/server"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export interface OverviewItem {
  id: string
  icon: string
  title: string
  desc: string
  href: string
  /** action tone — affects the pill colour; omit for setup items */
  tone?: "warn" | "danger"
}
export interface SettingsOverviewData {
  setup: OverviewItem[]
  action: OverviewItem[]
}

/** Active (non-deleted) row count for an org-scoped table — the count-derived setup signals. */
async function countActive(db: Db, table: "properties" | "landlords" | "user_orgs", orgId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null)
  logQueryError(`getSettingsOverview ${table}`, error)
  return count ?? 0
}

export async function getSettingsOverview(db: Db, orgId: string): Promise<SettingsOverviewData> {
  const setup: OverviewItem[] = []
  const action: OverviewItem[] = []

  // ── Subscription → effective tier + trial state ─────────────────────────────
  const { data: sub, error: subErr } = await db
    .from("subscriptions")
    .select("tier, status, current_period_end, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .limit(1)
    .maybeSingle()
  logQueryError("getSettingsOverview subscriptions", subErr)
  const tier = sub ? getEffectiveTier(sub) : "owner"
  const isPaid = tier !== "owner"

  if (sub?.status === "trialing") {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null
    const days = ends ? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000)) : null
    const dayWord = days === 1 ? "day" : "days"
    action.push({
      id: "trial",
      icon: "billing",
      title: days == null ? "Choose your plan" : `Trial ends in ${days} ${dayWord}`,
      desc: "Pick a plan to keep your workspace active when the trial ends.",
      href: "/settings/subscription",
      tone: days != null && days <= 3 ? "danger" : "warn",
    })
  }

  // ── Core data → first property / landlord. Count-derived, so adding one ANYWHERE (not just via the
  //    card) clears it on the next load — never a click-dismiss. ───────────────────────────────────
  if ((await countActive(db, "properties", orgId)) === 0) {
    setup.push({
      id: "property", icon: "property", title: "Add your first property",
      desc: "Create a property to start managing units, leases and tenants.", href: "/properties/new",
    })
  }
  if ((await countActive(db, "landlords", orgId)) === 0) {
    setup.push({
      id: "landlord", icon: "landlord", title: "Add a landlord",
      desc: "Add the property owner you manage on behalf of.", href: "/landlords",
    })
  }

  // ── Branding → logo not set ─────────────────────────────────────────────────
  const org = await fetchOrgSettings(orgId)
  if (org && !org.brand_logo_url) {
    setup.push({
      id: "branding", icon: "branding", title: "Add your branding",
      desc: "Put your logo and colours on statements, leases and the tenant portal.", href: "/settings/details?tab=branding",
    })
  }

  // ── Team → a paid workspace still flying solo ───────────────────────────────
  if (isPaid && (await countActive(db, "user_orgs", orgId)) <= 1) {
    setup.push({
      id: "team", icon: "team", title: "Invite your team",
      desc: "Add agents and bookkeepers and set who sees which portfolios.", href: "/settings/team",
    })
  }

  return { setup, action }
}
