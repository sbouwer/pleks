/**
 * lib/org/capabilities.ts — Org-type capability map, copy keys, and defaults
 *
 * Notes: Single source of truth for what surfaces are available per org type (D-61A-01).
 *        Agency = full surface. Landlord = subset — no team, no compliance, no HOA, etc.
 *        sole_prop treated as agency-mode (same structural needs, falls through to default).
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

  // Trust account framing — same schema, different presentation (D-61A-07)
  trustAccountLabel: "trust" | "deposits"

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
