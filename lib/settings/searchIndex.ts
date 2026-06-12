/**
 * lib/settings/searchIndex.ts — the searchable index of settings destinations
 *
 * Notes:  Powers the Overview search. It indexes ONLY /settings/* destinations (categories + their
 *         tabs) so results are always settings-related — "document" returns the Documents → Templates
 *         tab, never a property's lease document. Pure client-side filter; no /api/search. hrefs point
 *         at today's routes (folded sub-pages become tab anchors when those category pages are built).
 *         Keep in step with SettingsSidebar / MobileSettingsNav.
 */
import type { SearchResult } from "@/components/layout/GlobalSearch"

export type SettingsSection = "account" | "workspace" | "finance" | "support"

interface SettingsDest {
  /** the destination name (the search hit) */
  label: string
  /** parent category, shown as the result subtitle for context */
  subtitle: string
  section: SettingsSection
  href: string
  /** alias terms (synonyms) that route here even when the word isn't on the page — e.g. "2fa" →
   *  Two-factor, "downgrade"/"tier"/"owner" → Billing & plan. Space-separated. */
  kw?: string
}

// Shared vocabulary spread into entries so it never drifts. Tier names + the verbs people actually
// type ("downgrade", "cancel") all route to Billing & plan even though the page never shows them.
const TIER_TERMS = "subscription plan tier upgrade downgrade cancel renew seats owner steward growth portfolio firm bespoke free paid"

const SETTINGS_INDEX: SettingsDest[] = [
  // ── Account ────────────────────────────────────────────────────────────────
  { label: "My profile", subtitle: "Account", section: "account", href: "/settings/profile?tab=personal", kw: "personal name id number details mobile email phone" },
  { label: "Address", subtitle: "My profile", section: "account", href: "/settings/profile?tab=address", kw: "address postal billing suburb city" },
  { label: "Signature", subtitle: "My profile", section: "account", href: "/settings/profile?tab=signature", kw: "sign signing leases" },
  { label: "Security", subtitle: "Account", section: "account", href: "/settings/security", kw: "sign in" },
  { label: "Password", subtitle: "Security", section: "account", href: "/settings/security?tab=password", kw: "change password" },
  { label: "Two-factor", subtitle: "Security", section: "account", href: "/settings/security?tab=mfa", kw: "2fa otp totp authenticator mfa" },
  { label: "Passkeys", subtitle: "Security", section: "account", href: "/settings/security?tab=mfa", kw: "passkey face id touch id biometric" },
  { label: "Sign-in activity", subtitle: "Security", section: "account", href: "/settings/security?tab=sessions", kw: "sessions devices sign out" },
  { label: "Notifications", subtitle: "Account", section: "account", href: "/settings/notifications", kw: "alerts" },
  { label: "Notification channels", subtitle: "Notifications", section: "account", href: "/settings/notifications", kw: "email whatsapp sms push quiet hours" },
  { label: "Notification events", subtitle: "Notifications", section: "account", href: "/settings/notifications", kw: "arrears applications maintenance" },

  // ── Workspace ──────────────────────────────────────────────────────────────
  { label: "Organisation", subtitle: "Workspace", section: "workspace", href: "/settings/details", kw: "company business details registered entity" },
  { label: "Company details", subtitle: "Organisation", section: "workspace", href: "/settings/details?tab=details", kw: "name vat registration ppra ffc" },
  { label: "Branding", subtitle: "Organisation", section: "workspace", href: "/settings/details?tab=branding", kw: "logo colours statement tenant portal font document layout" },
  { label: "Opening hours", subtitle: "Organisation", section: "workspace", href: "/settings/details?tab=hours", kw: "office hours open close weekday" },
  { label: "Emergency contact", subtitle: "Organisation", section: "workspace", href: "/settings/details?tab=emergency", kw: "after-hours emergency phone contact" },
  { label: "Configuration", subtitle: "Organisation", section: "workspace", href: "/settings/details?tab=configuration", kw: "regional currency date timezone defaults tone communication sms" },
  { label: "Team & access", subtitle: "Workspace", section: "workspace", href: "/settings/team", kw: "members invite users seats" },
  { label: "Roles & permissions", subtitle: "Team & access", section: "workspace", href: "/settings/team", kw: "roles permissions access" },
  { label: "Documents", subtitle: "Workspace", section: "workspace", href: "/settings/documents/templates", kw: "templates statements receipts notices" },
  { label: "Document templates", subtitle: "Documents", section: "workspace", href: "/settings/documents/templates", kw: "statement receipt arrears notice" },
  { label: "Lease templates", subtitle: "Documents", section: "workspace", href: "/settings/lease-templates", kw: "lease clauses agreement" },
  { label: "Compliance", subtitle: "Workspace", section: "workspace", href: "/settings/compliance", kw: "ppra popia fica posture audit" },
  { label: "POPIA & consents", subtitle: "Compliance", section: "workspace", href: "/settings/privacy/compliance-dashboard", kw: "popia consent privacy data protection" },
  { label: "Information officer", subtitle: "Compliance", section: "workspace", href: "/settings/privacy/information-officer", kw: "popia officer" },
  { label: "Data subject requests", subtitle: "Compliance", section: "workspace", href: "/settings/privacy/data-subject-requests", kw: "dsar erasure access popia" },
  { label: "Retention", subtitle: "Compliance", section: "workspace", href: "/settings/privacy/retention", kw: "retention purge popia" },

  // ── Finance ────────────────────────────────────────────────────────────────
  { label: "Billing & plan", subtitle: "Finance", section: "finance", href: "/settings/subscription", kw: `${TIER_TERMS} pay pricing` },
  { label: "Payment method", subtitle: "Billing & plan", section: "finance", href: "/settings/subscription", kw: "card payment billing" },
  { label: "Invoices", subtitle: "Billing & plan", section: "finance", href: "/settings/subscription", kw: "receipts billing history" },
  { label: "Trust account", subtitle: "Finance", section: "finance", href: "/settings/deposits", kw: "trust deposits bank reconciliation payouts" },

  // ── Support ────────────────────────────────────────────────────────────────
  { label: "Data", subtitle: "Support", section: "support", href: "/settings/import", kw: "import export migration csv" },
  { label: "Import", subtitle: "Data", section: "support", href: "/settings/import", kw: "csv migration weconnectu payprop" },
  { label: "Feedback", subtitle: "Support", section: "support", href: "/settings/my-feedback", kw: "bug report idea suggestion" },
]

/** Score a destination against the query: label hits rank above subtitle, which rank above aliases. */
function scoreDest(d: SettingsDest, q: string): number {
  const label = d.label.toLowerCase()
  if (label.startsWith(q)) return 4
  if (label.includes(q)) return 3
  if (d.subtitle.toLowerCase().includes(q)) return 2
  if ((d.kw ?? "").toLowerCase().includes(q)) return 1   // alias-only match (word not on the page)
  return 0
}

export function searchSettings(query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SETTINGS_INDEX
    .map((d) => ({ d, score: scoreDest(d, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ d }) => ({ type: d.section, id: `${d.section}:${d.label}`, label: d.label, subtitle: d.subtitle, href: d.href }))
}
