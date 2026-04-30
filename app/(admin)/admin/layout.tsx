/**
 * app/(admin)/admin/layout.tsx — Platform admin shell with left sidebar
 *
 * Auth:   pleks_admin_token cookie verified via HMAC — unauthenticated renders children only
 * Notes:  AdminSidebar is a server component; AdminTopBar is a client component.
 *         Wraps in .pleks-portal for light-first design tokens; dark mode via next-themes.
 */
import { cookies } from "next/headers"
import { verifyAdminToken } from "@/lib/auth/admin-token"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { AdminTopBar } from "@/components/admin/AdminTopBar"

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  const isAuthenticated = await verifyAdminToken(token, process.env.ADMIN_SECRET)

  if (!isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="pleks-portal" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <div style={{ display: "flex", flex: 1 }}>
        <AdminSidebar />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <AdminTopBar />
          <main style={{ flex: 1, background: "var(--paper)", overflowY: "auto", padding: "28px 32px" }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
