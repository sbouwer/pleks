/**
 * app/(dashboard)/dashboard/WorkspaceSetup.tsx — "set up your workspace" card (new-user empty state)
 *
 * Route:  /dashboard (rendered alongside GettingStarted when the org is new)
 * Notes:  Informs without overwhelming — a single door card listing the optional Settings areas
 *         (company details, branding, lease docs, deposits, team, profile) that shape statements,
 *         leases and the tenant portal. Each row links to its Settings destination.
 */
import Link from "next/link"
import { ArrowRight, Landmark, Zap, FileText, Wallet, UserCheck, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface SetupItem { icon: LucideIcon; title: string; desc: string; href: string; agencyOnly?: boolean }

const ITEMS: SetupItem[] = [
  { icon: Landmark,  title: "Your details",             desc: "Your contact details, banking and (for agencies) PPRA FFC number.",  href: "/settings" },
  { icon: Zap,       title: "Branding",                 desc: "Add your logo and colours to statements and the tenant portal.",    href: "/settings" },
  { icon: FileText,  title: "Lease document templates", desc: "Customise the clauses and documents you issue.",                    href: "/settings" },
  { icon: Wallet,    title: "Trust / deposits account", desc: "Connect the account for owner payouts and deposit holding.",        href: "/settings/subscription", agencyOnly: true },
  { icon: UserCheck, title: "Team",                     desc: "Invite agents and set who sees which portfolios.",                  href: "/settings/team", agencyOnly: true },
  { icon: User,      title: "Your profile & signature", desc: "Your name, contact details and signing signature.",                 href: "/settings/profile" },
]

export function WorkspaceSetup({ isOwner = false }: Readonly<{ isOwner?: boolean }>) {
  // Owner tier (self-managing, single property, no team or trust account) skips the agency-only items.
  const items = ITEMS.filter((it) => !(isOwner && it.agencyOnly))
  return (
    <div className="mt-4 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <span className="flex items-center gap-2.5 font-heading text-sm font-semibold text-foreground">
          <span aria-hidden className="h-0.5 w-4 bg-primary" />
          Set up your workspace
        </span>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          All settings <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="px-5 pb-1 pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Optional, but worth doing — these shape how your statements, leases and tenant portal look and work. Do them whenever you like.
      </p>
      {items.map((it) => {
        const Icon = it.icon
        return (
          <Link
            key={it.title}
            href={it.href}
            className="grid grid-cols-[38px_1fr_auto] items-center gap-3.5 border-t border-border px-5 py-3 transition-colors hover:bg-muted/40"
          >
            <span className="grid h-[38px] w-[38px] place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-[13.5px] font-semibold text-foreground">{it.title}</span>
              <span className="block text-xs text-muted-foreground">{it.desc}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )
      })}
    </div>
  )
}
