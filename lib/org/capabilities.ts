/**
 * lib/org/capabilities.ts — Org-type capability map, copy keys, and defaults
 *
 * Notes: Single source of truth for what surfaces are available per org type (D-61A-01).
 *        Agency = full surface. Landlord = subset — no team, no compliance, no HOA, etc.
 *        sole_prop treated as agency-mode (same structural needs, falls through to default).
 *        hoa_manager (ADDENDUM_18C D-18C-03/04) = standalone HOA line: lease/tenant/application
 *        surfaces OFF, HOA on, trust framing relabelled to scheme funds (same D-TRUST-01 posture).
 *        Capabilities are orthogonal to tier (what's paid for) and role (what the user can do).
 *        subscriptionStatus adds isLockedDown / subscriptionStateVariant (ADDENDUM_57G).
 */
import type { OrgType } from "@/lib/constants"
import type { SubscriptionStatus } from "@/lib/subscriptions/state"

export type SubscriptionStateVariant =
  | "normal" | "past_due" | "paused" | "cancelled" | "dormant_warning"

export interface OrgCapabilities {
  // Structural capabilities — drive feature visibility and redirect guards (D-61A-04/09)
  hasTeam: boolean
  hasCompliance: boolean
  hasOpeningHours: boolean
  hasLandlordsList: boolean
  hasHOA: boolean
  hasCommissionSplits: boolean
  hasAgentAssignment: boolean
  hasAgentProductivity: boolean

  // Product-line surface gates (ADDENDUM_18C D-18C-04) — default true; false only for the standalone
  // HOA line (hoa_manager), which switches the whole rental surface off (leases, tenants, applications,
  // listings, arrears, tenant portals). Nav + redirect guards read these to hide those surfaces.
  hasLeases: boolean
  hasTenants: boolean
  hasApplications: boolean

  // Trust account framing — same schema + same D-TRUST-01 posture, different presentation (D-61A-07).
  // "scheme_funds" (ADDENDUM_18C) relabels the HOA-line surface (levy & reserve account) — the sovereignty
  // invariant is unchanged; only the display label differs.
  trustAccountLabel: "trust" | "deposits" | "scheme_funds"

  // Subscription lockdown (ADDENDUM_57G D-57G-02): binary by role, not granular by action.
  // isLockedDown blocks all agent writes; subscriptionStateVariant drives banner copy.
  isLockedDown: boolean
  subscriptionStateVariant: SubscriptionStateVariant

  // User-visible copy strings — grep `capabilities.copy.` to find all type-aware strings (D-61A-06)
  copy: {
    propertiesPageTitle: string
    tenantsPageTitle: string
    onboardingWelcome: string
    dashboardEmptyProperties: string
    signatureAttribution: string
    tenantWelcomeSender: string
  }

  // Default preferences — starting point only; per-org overrides stored in organisations.settings (D-61A-06)
  defaults: {
    tenantTone: "friendly" | "professional" | "firm"
  }
}

/**
 * Nav label for the trust-ledger surface given the org's trust framing (D-61A-07 / ADDENDUM_18C). Shared
 * by the desktop + mobile nav so the relabel can't drift. Same underlying D-TRUST-01 posture in every
 * case — display only. `fallback` is the caller's default label (e.g. "Trust Ledger" / "Trust").
 */
export function trustLedgerNavLabel(
  label: OrgCapabilities["trustAccountLabel"] | undefined,
  fallback: string,
): string {
  if (label === "deposits") return "Deposit holdings"
  if (label === "scheme_funds") return "Scheme funds"
  return fallback
}

function toVariant(status: SubscriptionStatus): SubscriptionStateVariant {
  switch (status) {
    case "past_due":  return "past_due"
    case "paused":    return "paused"
    case "cancelled": return "cancelled"
    default:          return "normal"
  }
}

export function getOrgCapabilities(
  orgType: OrgType,
  orgName: string,
  subscriptionStatus: SubscriptionStatus = "active",
): OrgCapabilities {
  const isLockedDown = subscriptionStatus === "paused" || subscriptionStatus === "cancelled"
  const subscriptionStateVariant = toVariant(subscriptionStatus)
  switch (orgType) {
    case "landlord":
      return {
        hasTeam: false,
        hasCompliance: false,
        hasOpeningHours: false,
        hasLandlordsList: false,
        hasHOA: false,
        hasCommissionSplits: false,
        hasAgentAssignment: false,
        hasAgentProductivity: false,
        hasLeases: true,
        hasTenants: true,
        hasApplications: true,
        trustAccountLabel: "deposits",
        isLockedDown,
        subscriptionStateVariant,
        copy: {
          propertiesPageTitle: "My properties",
          tenantsPageTitle: "My tenants",
          onboardingWelcome: "Welcome to Pleks. Let's set up your property portfolio.",
          dashboardEmptyProperties: "You haven't added any properties yet. Add your first property.",
          signatureAttribution: `Signed by ${orgName}`,
          tenantWelcomeSender: orgName,
        },
        defaults: { tenantTone: "professional" },
      }

    // Standalone HOA-management company (ADDENDUM_18C D-18C-03/04). Lease-less: the whole rental surface
    // is off (hasLeases/hasTenants/hasApplications false). HOA on. Trust framing relabelled to scheme
    // funds — SAME D-TRUST-01 posture (Pleks is not the trustee), only the display label differs.
    case "hoa_manager":
      return {
        hasTeam: true,
        hasCompliance: true,
        hasOpeningHours: true,
        hasLandlordsList: false, // no landlord/tenant relationship on the HOA line
        hasHOA: true,
        hasCommissionSplits: false, // no rental commission on the HOA line
        hasAgentAssignment: true,
        hasAgentProductivity: true,
        hasLeases: false,
        hasTenants: false,
        hasApplications: false,
        trustAccountLabel: "scheme_funds",
        isLockedDown,
        subscriptionStateVariant,
        copy: {
          propertiesPageTitle: "Schemes",
          tenantsPageTitle: "Unit owners",
          onboardingWelcome: "Welcome to Pleks. Let's set up your managing agency.",
          dashboardEmptyProperties: "You haven't added any schemes yet. Add your first scheme.",
          signatureAttribution: `Signed on behalf of ${orgName}`,
          tenantWelcomeSender: orgName,
        },
        defaults: { tenantTone: "professional" },
      }

    case "agency":
    case "sole_prop":
    default:
      return {
        hasTeam: true,
        hasCompliance: true,
        hasOpeningHours: true,
        hasLandlordsList: true,
        hasHOA: true,
        hasCommissionSplits: true,
        hasAgentAssignment: true,
        hasAgentProductivity: true,
        hasLeases: true,
        hasTenants: true,
        hasApplications: true,
        trustAccountLabel: "trust",
        isLockedDown,
        subscriptionStateVariant,
        copy: {
          propertiesPageTitle: "Managed properties",
          tenantsPageTitle: "Your tenants",
          onboardingWelcome: "Welcome to Pleks. Let's set up your agency.",
          dashboardEmptyProperties: "You haven't added any properties yet. Import from TPN or add manually.",
          signatureAttribution: `Signed on behalf of ${orgName}`,
          tenantWelcomeSender: orgName,
        },
        defaults: { tenantTone: "firm" },
      }
  }
}
