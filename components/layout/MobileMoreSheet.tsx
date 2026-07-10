"use client"

/**
 * components/layout/MobileMoreSheet.tsx — Mobile "More" navigation sheet
 *
 * Auth:   Rendered inside the dashboard layout (gateway-protected)
 * Notes:  Mirrors Sidebar.tsx filtering — /landlords hidden if !hasLandlordsList,
 *         /hoa hidden if !hasHOA (D-61A-04). Trust Ledger relabelled per trustAccountLabel (D-61A-07).
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { CloudDownload } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
import { trustLedgerNavLabel } from "@/lib/org/capabilities"
import { useNavGate } from "@/hooks/useNavGate"

const SECTIONS = [
  {
    label: "Portfolio",
    items: [
      { href: "/properties", label: "Properties" },
      { href: "/hoa", label: "HOA" },
      { href: "/landlords", label: "Landlords" },
      { href: "/tenants", label: "Tenants" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/leases", label: "Leases" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/listings", label: "Listings" },
      { href: "/maintenance", label: "Maintenance" },
      { href: "/inspections", label: "Inspections" },
      { href: "/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance", label: "Overview" },
      { href: "/finance/deposits", label: "Deposits" },
      { href: "/finance/trust-ledger", label: "Trust" },
      { href: "/billing", label: "Billing" },
      { href: "/statements", label: "Statements" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "Settings" },
    ],
  },
]

interface MobileMoreSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onOpenOffline?: () => void
}

export function MobileMoreSheet({ open, onOpenChange, onOpenOffline }: MobileMoreSheetProps) {
  const pathname = usePathname()
  const router = useRouter()
  const caps = useOrgCapabilities()
  const canSee = useNavGate()  // shared capability + tier gate (same predicate as desktop) — RBAC P4

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    onOpenChange(false)
    router.push("/login")
  }

  const sections = SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => {
        if (!canSee(item.href)) return false  // capability + tier (shared SSOT predicate)
        if (item.href === "/landlords" && caps !== null && !caps.hasLandlordsList) return false
        // FAIL-CLOSED: HOA is standalone (2026-07-10) and off for every residential package, so an
        // unresolved `caps` must HIDE it — not flash it and bounce the agent to /403 on click.
        if (item.href === "/hoa" && !caps?.hasHOA) return false
        // Product-line surface gates (ADDENDUM_18C D-18C-04) — HOA line switches the rental surface off.
        if (item.href === "/leases" && caps !== null && !caps.hasLeases) return false
        if (item.href === "/tenants" && caps !== null && !caps.hasTenants) return false
        if (item.href === "/listings" && caps !== null && !caps.hasApplications) return false
        return true
      })
      .map((item) => ({
        ...item,
        label: item.href === "/finance/trust-ledger"
          ? trustLedgerNavLabel(caps?.trustAccountLabel, item.label)
          : item.label,
      })),
  })).filter((section) => section.items.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[80vh] overflow-y-auto p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>

        <div className="px-4 pt-4 pb-6 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                {section.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onOpenChange(false)}
                      className={`rounded-[var(--r-button)] border border-border px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand/10 text-brand border-brand/30"
                          : "bg-card text-foreground hover:bg-muted active:bg-muted"
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Device tools */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Device</p>
            <button
              type="button"
              onClick={() => { onOpenChange(false); onOpenOffline?.() }}
              className="w-full flex items-center gap-2 rounded-[var(--r-button)] border border-border px-4 py-3 text-sm font-medium bg-card hover:bg-muted active:bg-muted transition-colors"
            >
              <CloudDownload className="h-4 w-4 text-muted-foreground" />
              Offline &amp; sync
            </button>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-[var(--r-button)] border border-border px-4 py-3 text-sm font-medium text-destructive bg-card hover:bg-muted active:bg-muted transition-colors"
          >
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
