/**
 * lib/settings/catalog.ts — the canonical list of visitable Settings pages
 *
 * Notes:  Single source for the Overview "Frequently used" cards + visit matching. Mirrors the
 *         SettingsSidebar nav (href + label + icon) and adds a short card description. `prefixes` folds
 *         sub-routes onto their parent card (e.g. /settings/branding → Organisation), matching the
 *         sidebar's extraPrefixes.
 */
import {
  User, KeyRound, Bell, Building2, Users, FileText, ShieldCheck, CreditCard, Landmark, Database,
  MessageSquare, type LucideIcon,
} from "lucide-react"

export interface SettingsPage {
  href: string
  title: string
  desc: string
  icon: LucideIcon
  /** sub-routes that count as a visit to this page */
  prefixes?: string[]
}

export const SETTINGS_CATALOG: SettingsPage[] = [
  { href: "/settings/profile", title: "My profile", desc: "Your name, email and personal details", icon: User },
  { href: "/settings/security", title: "Security", desc: "Password, passkeys and MFA", icon: KeyRound },
  { href: "/settings/notifications", title: "Notifications", desc: "Email and in-app alerts", icon: Bell },
  { href: "/settings/details", title: "Organisation", desc: "Org profile, branding and hours", icon: Building2, prefixes: ["/settings/branding", "/settings/hours", "/settings/configuration"] },
  { href: "/settings/team", title: "Team & access", desc: "Members, roles and teams", icon: Users },
  { href: "/settings/templates", title: "Templates", desc: "Letters, emails, WhatsApp & notices — see what goes out", icon: FileText, prefixes: ["/settings/templates", "/settings/documents", "/settings/lease-templates"] },
  { href: "/settings/compliance", title: "Compliance", desc: "POPIA, FICA and legal", icon: ShieldCheck },
  { href: "/settings/subscription", title: "Billing & plan", desc: "Your plan, invoices and payment", icon: CreditCard },
  { href: "/settings/deposits", title: "Trust account", desc: "Deposit and trust banking", icon: Landmark },
  { href: "/settings/import", title: "Data", desc: "Import, export and backups", icon: Database },
  { href: "/settings/my-feedback", title: "Feedback", desc: "Your feedback and requests", icon: MessageSquare, prefixes: ["/settings/feedback"] },
]

/** Top-N most-visited catalog hrefs (count > 0), most-visited first — derived from stored visit counts. */
export function topVisitedHrefs(pageVisits: Record<string, number>, n: number): string[] {
  return SETTINGS_CATALOG
    .map((p) => ({ href: p.href, count: pageVisits[p.href] ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((x) => x.href)
}

/** The catalog page a pathname belongs to (exact, child route, or a declared prefix) — longest match wins. */
export function matchSettingsPage(pathname: string): SettingsPage | null {
  let best: SettingsPage | null = null
  let bestLen = -1
  for (const p of SETTINGS_CATALOG) {
    for (const c of [p.href, ...(p.prefixes ?? [])]) {
      if ((pathname === c || pathname.startsWith(c + "/")) && c.length > bestLen) {
        best = p
        bestLen = c.length
      }
    }
  }
  return best
}
