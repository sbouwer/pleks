"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

const SECTIONS = [
  {
    label: "Portfolio",
    items: [
      { href: "/properties", label: "Properties" },
      { href: "/landlords", label: "Landlords" },
      { href: "/tenants", label: "Tenants" },
      { href: "/contractors", label: "Suppliers" },
      { href: "/leases", label: "Leases" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/applications", label: "Applications" },
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
      { href: "/payments", label: "Billing" },
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
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    onOpenChange(false)
    router.push("/login")
  }

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
          {SECTIONS.map((section) => (
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
                      className={`rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors ${
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

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-lg border border-border px-4 py-3 text-sm font-medium text-destructive bg-card hover:bg-muted active:bg-muted transition-colors"
          >
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
