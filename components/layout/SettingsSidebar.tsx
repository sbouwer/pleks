"use client"

/**
 * components/layout/SettingsSidebar.tsx — Settings navigation sidebar
 *
 * Route:  /settings/*
 * Auth:   Rendered inside the dashboard layout (gateway-protected)
 * Notes:  The consolidated settings IA — Overview + four grouped, icon'd, tier-gated categories
 *         (Workspace / Finance / Account / Support). Deliberately SHORT: multi-route areas fold into
 *         one item (Organisation absorbs branding/hours/configuration; Documents absorbs lease-templates;
 *         My profile absorbs signature; Feedback absorbs the inbox) — those become tabs on the category
 *         pages, so the item links to the primary route for now (extraPrefixes keep the parent highlighted
 *         while on a folded route). Gating is tier-based (useTier.isPaid): Team/Documents/Trust/Data are
 *         paid; Organisation + Compliance stay visible for the free Owner (branding + light POPIA) per the
 *         trimmed-workspace decision. Mobile mirror: components/mobile/MobileSettingsNav.tsx (to re-sync).
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeft, Settings as SettingsIcon, LayoutGrid, Building2, Users, FileText,
  ShieldCheck, CreditCard, Landmark, User, KeyRound, Bell, Database, MessageSquare,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTier } from "@/hooks/useTier"
import { usePermissions } from "@/hooks/usePermissions"
import { useCapabilities } from "@/components/auth/CapabilitiesProvider"
import { AccentBracket } from "@/components/ui/AccentBracket"

interface SettingsItem {
  href: string
  label: string
  icon: LucideIcon
  /** hidden on the free Owner tier (steward and up only) */
  paid?: boolean
  /** keep this item highlighted while on a folded sub-route (a future tab) */
  extraPrefixes?: string[]
}
interface SettingsGroup { title: string; items: SettingsItem[] }

const GROUPS: SettingsGroup[] = [
  { title: "Account", items: [
    { href: "/settings/profile", label: "My profile", icon: User },
    { href: "/settings/security", label: "Security", icon: KeyRound },
    { href: "/settings/notifications", label: "Notifications", icon: Bell },
  ]},
  { title: "Workspace", items: [
    { href: "/settings/details", label: "Organisation", icon: Building2,
      extraPrefixes: ["/settings/branding", "/settings/hours", "/settings/configuration"] },
    { href: "/settings/team", label: "Team & access", icon: Users },
    { href: "/settings/documents/templates", label: "Documents", icon: FileText, paid: true,
      extraPrefixes: ["/settings/documents", "/settings/lease-templates"] },
    { href: "/settings/compliance", label: "Compliance", icon: ShieldCheck },
  ]},
  { title: "Finance", items: [
    { href: "/settings/subscription", label: "Billing & plan", icon: CreditCard },
    { href: "/settings/deposits", label: "Trust account", icon: Landmark, paid: true },
  ]},
  { title: "Support", items: [
    { href: "/settings/import", label: "Data", icon: Database, paid: true },
    { href: "/settings/my-feedback", label: "Feedback", icon: MessageSquare,
      extraPrefixes: ["/settings/feedback"] },
  ]},
]

// Settings sub-route → required capability (RBAC P4). Personal sections (profile/security/notifications/
// feedback) + the Overview are intentionally ungated — a member must always reach their own account.
const SETTINGS_CAPABILITY: Record<string, string> = {
  "/settings/details": "org",
  "/settings/team": "team",
  "/settings/documents/templates": "documents",
  "/settings/compliance": "org",
  "/settings/subscription": "billing",
  "/settings/deposits": "finance",
  "/settings/import": "org",
}

function NavRow({ href, label, icon: Icon, active }: Readonly<{ href: string; label: string; icon: LucideIcon; active: boolean }>) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--r-button)] px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary"
          : "text-muted-foreground hover:bg-primary/[0.08] hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}

export function SettingsSidebar() {
  const pathname = usePathname()
  const { isPaid, isOwner, loading } = useTier()
  const { isAdmin } = usePermissions()  // owner / is_admin — the upgrade nudge is theirs, not every member's
  const { has } = useCapabilities()     // hide settings sections the member lacks the capability for (RBAC P4)

  const isActive = (href: string, extra?: string[]) =>
    pathname === href || pathname.startsWith(href + "/") ||
    (extra?.some((p) => pathname === p || pathname.startsWith(p + "/")) ?? false)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo bar — same height/border as the main sidebar so it aligns with the content topbar */}
      <div className="flex h-16 shrink-0 items-center border-b border-border/50 px-4">
        <Link href="/dashboard" className="pub-wordmark" style={{ fontSize: 20 }} aria-label="Pleks">
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
        </Link>
      </div>

      {/* Settings header — back to app + the settings title, sitting below the logo */}
      <div className="px-3 pb-2 pt-4">
        <Link
          href="/dashboard"
          className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to app
        </Link>
        <div className="mt-2 flex items-center gap-2 px-2">
          <SettingsIcon className="h-[19px] w-[19px] text-brand" />
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Settings</h2>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1">
          <NavRow href="/settings" label="Overview" icon={LayoutGrid} active={pathname === "/settings"} />
        </div>

        {GROUPS.map((group) => {
          const items = group.items.filter((it) => {
            if (it.paid && !isPaid) return false
            const reqCap = SETTINGS_CAPABILITY[it.href]
            return !reqCap || has(reqCap)
          })
          if (!items.length) return null
          return (
            <div key={group.title} className="mt-4">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {items.map((it) => (
                  <li key={it.href}>
                    <NavRow href={it.href} label={it.label} icon={it.icon} active={isActive(it.href, it.extraPrefixes)} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {!loading && isOwner && isAdmin && (
          <div className="mx-2 mt-5 rounded-xl border border-border border-b-2 border-b-brand bg-card p-3.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand">Upgrade</p>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-foreground">Running more than your own rental?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Steward unlocks your agency workspace — documents, trust account and more.
            </p>
            <Link
              href="/settings/subscription"
              className="mt-3 flex w-full items-center justify-center rounded-md bg-foreground px-3 py-2 text-[13px] font-medium text-background transition-colors hover:bg-brand"
            >
              See Steward
            </Link>
          </div>
        )}
      </nav>
    </div>
  )
}
