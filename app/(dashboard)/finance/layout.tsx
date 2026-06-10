/**
 * app/(dashboard)/finance/layout.tsx — finance-capability gate for the finance subtree
 *
 * Auth:   gatewaySSR + the 'finance' capability (owner / is_admin exempt) — RBAC P4. Guards /finance,
 *         /finance/deposits and /finance/trust-ledger (the last is a client page, so a layout is the
 *         single SSR insertion point). Non-capable members redirect to /403.
 * Notes:  Defence in depth — the finance server actions also re-check the capability (the boundary).
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"

export default async function FinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!(await hasCapability(gw, "finance"))) redirect("/403")
  return children
}
