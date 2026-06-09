/**
 * app/(dashboard)/settings/subscription/layout.tsx — billing-capability gate for the subscription surface
 *
 * Auth:   gatewaySSR + the 'billing' capability (owner / is_admin exempt) — RBAC P4. A member without it
 *         (e.g. admin_assistant) is redirected to /403 rather than reaching pause/cancel/upgrade.
 * Notes:  Defence in depth — the subscription server actions also re-check the capability (the boundary).
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { can } from "@/lib/auth/can"

export default async function SubscriptionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!gw.isAdmin && !(await can("billing"))) redirect("/403")
  return <>{children}</>
}
