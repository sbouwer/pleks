/**
 * lib/auth/requireCapability.ts — server route guard for capability-gated surfaces (RBAC P4 STEP 2)
 *
 * Auth:   gatewaySSR + the given capability (owner / is_admin exempt). Call at the top of a route layout:
 *           export default async function Layout({ children }) { await requireCapability("properties"); return children }
 * Notes:  Redirects unauthenticated → /login, non-capable → /403. Affordance (nav) is separate; this + the
 *         server action checks + RLS are the boundary.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"

export async function requireCapability(capability: string): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!(await hasCapability(gw, capability))) redirect("/403")
}
