/**
 * app/(dashboard)/statements/layout.tsx — finance-capability gate for owner statements
 *
 * Auth:   gatewaySSR + the 'finance' capability (owner / is_admin exempt) — RBAC P4; redirects to /403.
 * Notes:  /statements is a separate top-level route from /finance, so it needs its own guard.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { can } from "@/lib/auth/can"

export default async function StatementsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!gw.isAdmin && !(await can("finance"))) redirect("/403")
  return children
}
