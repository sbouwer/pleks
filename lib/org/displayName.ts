export interface OrgNameFields {
  name: string           // organisations.name — legal/system name
  type: string           // 'agency' | 'landlord' | 'sole_prop' (raw DB column)
  user_type?: string | null  // 'owner' | 'agent' | 'agency' etc. — owner maps to landlord tier
  trading_as?: string | null
  title?: string | null
  first_name?: string | null
  last_name?: string | null
  initials?: string | null
}

/** Matches the same logic as api/org/details effectiveType derivation */
function isPersonalTier(org: OrgNameFields): boolean {
  return org.type === "landlord" || org.type === "sole_prop" || org.user_type === "owner"
}

/**
 * Returns the correct display name for the organisation based on type and
 * available personal details.
 *
 * Priority:
 * 1. trading_as — always wins when set (user explicitly chose a brand name)
 * 2. Personal name (landlord/sole_prop/owner) — formal format with title + initials
 * 3. organisations.name — fallback (agency legal name, or onboarding placeholder)
 */
export function getOrgDisplayName(org: OrgNameFields): string {
  if (org.trading_as?.trim()) return org.trading_as.trim()

  if (isPersonalTier(org)) {
    if (org.last_name?.trim()) {
      if (org.initials?.trim()) {
        return [org.title, org.initials, org.last_name].filter(Boolean).join(" ")
      }
      if (org.first_name?.trim()) {
        return [org.title, org.first_name, org.last_name].filter(Boolean).join(" ")
      }
      return [org.title, org.last_name].filter(Boolean).join(" ")
    }
  }

  return org.name
}

/**
 * Returns the legal name for contracts and official documents.
 * For agencies: the registered entity name (org.name).
 * For personal tiers: full name with title + first_name + last_name.
 */
export function getOrgLegalName(org: OrgNameFields): string {
  if (!isPersonalTier(org)) return org.name

  if (org.first_name?.trim() && org.last_name?.trim()) {
    return [org.title, org.first_name, org.last_name].filter(Boolean).join(" ")
  }

  return org.name
}
