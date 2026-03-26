"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { DemoProvider } from "@/lib/demo/DemoContext"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard, Building2, Users, FileText,
  ClipboardCheck, Wrench, CreditCard, BarChart3,
  Sparkles,
} from "lucide-react"

const DEMO_NAV = [
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demo/properties", label: "Properties", icon: Building2 },
  { href: "/demo/tenants", label: "Tenants", icon: Users },
  { href: "/demo/leases", label: "Leases", icon: FileText },
  { href: "/demo/payments", label: "Payments", icon: CreditCard },
  { href: "/demo/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/demo/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/demo/finance", label: "Financials", icon: BarChart3 },
]

export default function DemoInnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <DemoProvider>
      {/* Demo banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-brand text-primary-foreground px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0" />
          <span>You&apos;re exploring a demo — nothing you do here is saved.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs shrink-0"
          onClick={() => router.push("/onboarding?setup=true")}
        >
          Set up my account →
        </Button>
      </div>

      <div className="flex min-h-screen pt-10">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r border-border bg-surface shrink-0">
          <div className="p-4 border-b border-border">
            <Link href="/demo">
              <Image src="/logo.svg" alt="Pleks" width={90} height={28} className="h-7 w-auto" />
            </Link>
            <p className="text-[10px] text-brand mt-1 font-medium">DEMO</p>
          </div>
          <nav className="flex-1 p-2 space-y-0.5">
            {DEMO_NAV.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border flex justify-around py-2">
          {DEMO_NAV.slice(0, 5).map((item) => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-brand" : "text-muted-foreground"}`}>
                <item.icon className="size-5" />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </DemoProvider>
  )
}
