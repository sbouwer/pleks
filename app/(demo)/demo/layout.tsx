"use client"

/**
 * app/(demo)/demo/layout.tsx — demo shell: sidebar + content layout for /demo/*
 *
 * Route:  /demo/*
 * Auth:   public (parent layout redirects to /dashboard if user has an org)
 * Notes:  Wraps in PortalThemeProvider so the .pleks-portal CSS context (light theme)
 *         applies — without it all --surface/--sidebar/--brand tokens fall back to dark defaults.
 *         Demo banner is fixed; height ~40px accounted for with pt-10 on the content wrapper.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { DemoProvider } from "@/lib/demo/DemoContext"
import { Wordmark } from "@/components/ui/Wordmark"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import {
  LayoutDashboard, Building2, Users, FileText,
  ClipboardCheck, Wrench, CreditCard, BarChart3,
  Sparkles, User, Truck, ClipboardList, PieChart,
  Shield, Landmark,
} from "lucide-react"

// ── Nav structure ─────────────────────────────────────────────────────────────

type NavSection = "OVERVIEW" | "PORTFOLIO" | "OPERATIONS" | "FINANCE"

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  section: NavSection
}

const DEMO_NAV: NavItem[] = [
  // OVERVIEW
  { href: "/demo",                    label: "Dashboard",    icon: LayoutDashboard, section: "OVERVIEW"    },
  // PORTFOLIO
  { href: "/demo/properties",         label: "Properties",   icon: Building2,       section: "PORTFOLIO"   },
  { href: "/demo/landlords",          label: "Landlords",    icon: User,            section: "PORTFOLIO"   },
  { href: "/demo/tenants",            label: "Tenants",      icon: Users,           section: "PORTFOLIO"   },
  { href: "/demo/suppliers",          label: "Suppliers",    icon: Truck,           section: "PORTFOLIO"   },
  { href: "/demo/leases",             label: "Leases",       icon: FileText,        section: "PORTFOLIO"   },
  // OPERATIONS
  { href: "/demo/applications",       label: "Applications", icon: ClipboardList,   section: "OPERATIONS"  },
  { href: "/demo/maintenance",        label: "Maintenance",  icon: Wrench,          section: "OPERATIONS"  },
  { href: "/demo/inspections",        label: "Inspections",  icon: ClipboardCheck,  section: "OPERATIONS"  },
  // FINANCE
  { href: "/demo/finance",            label: "Overview",     icon: PieChart,        section: "FINANCE"     },
  { href: "/demo/finance/deposits",   label: "Deposits",     icon: Shield,          section: "FINANCE"     },
  { href: "/demo/finance/trust",      label: "Trust Ledger", icon: Landmark,        section: "FINANCE"     },
  { href: "/demo/finance/billing",    label: "Billing",      icon: CreditCard,      section: "FINANCE"     },
  { href: "/demo/finance/reports",    label: "Reports",      icon: BarChart3,       section: "FINANCE"     },
]

const SECTIONS: NavSection[] = ["OVERVIEW", "PORTFOLIO", "OPERATIONS", "FINANCE"]

// Mobile bottom nav: Dashboard, Properties, Tenants, Maintenance, Finance
const MOBILE_NAV = DEMO_NAV.filter((item) =>
  ["/demo", "/demo/properties", "/demo/tenants", "/demo/maintenance", "/demo/finance"].includes(item.href),
)

// ── Layout ────────────────────────────────────────────────────────────────────

export default function DemoInnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()

  function isActive(href: string) {
    if (href === "/demo") return pathname === "/demo"
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <PortalThemeProvider>
      <DemoProvider>
        {/* Demo banner — fixed at top; accounted for by pt-10 on content wrapper */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          background: "var(--ink)",
          padding: "8px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 13,
          color: "var(--paper)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} style={{ flexShrink: 0 }} />
            <span>You&apos;re exploring a demo — nothing you do here is saved.</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/onboarding?setup=true")}
            style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px",
              borderRadius: "var(--r-sm)", border: "none", cursor: "pointer",
              background: "var(--brand)", color: "var(--ink)", whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Set up my account →
          </button>
        </div>

        {/* Content — offset for fixed banner height (~40px) */}
        <div className="flex flex-1 overflow-hidden pt-10">

          {/* Sidebar — desktop only */}
          <aside className="hidden md:flex w-56 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
            <div style={{ padding: "16px", borderBottom: "1px solid var(--sidebar-border)" }}>
              <Wordmark href="/demo" style={{ fontSize: 20 }} />
              <p style={{ fontSize: 10, color: "var(--brand)", marginTop: 4, fontWeight: 600, letterSpacing: "0.08em" }}>DEMO</p>
            </div>

            <nav className="flex-1 p-2 overflow-y-auto">
              {SECTIONS.map((section) => {
                const items = DEMO_NAV.filter((item) => item.section === section)
                return (
                  <div key={section} className="mb-3">
                    <p className="px-3 py-1 text-[9px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      {section}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const active = isActive(item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                              active
                                ? "bg-brand/10 text-brand font-medium"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <item.icon className="size-4 shrink-0" />
                            {item.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around py-2">
          {MOBILE_NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-brand" : "text-muted-foreground"}`}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </DemoProvider>
    </PortalThemeProvider>
  )
}
