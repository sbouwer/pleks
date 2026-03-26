import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { AdminLogout } from "./AdminLogout"

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orgs", label: "Organisations" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/lease-requests", label: "Lease Requests" },
  { href: "/admin/audit", label: "Audit Log" },
]

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  const isAuthenticated = !!token && token === process.env.ADMIN_SECRET

  // Not authenticated — render children only (login page handles its own layout)
  if (!isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Amber top border */}
      <div className="h-0.5 bg-brand" />

      {/* Top bar */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image src="/logo-mark.svg" alt="Pleks" width={20} height={20} className="h-5 w-auto" />
              <span className="text-sm font-semibold text-brand">Admin</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <AdminLogout />
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-border bg-surface px-4 py-2 flex gap-3 overflow-x-auto">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
