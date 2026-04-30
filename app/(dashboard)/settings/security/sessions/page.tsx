/**
 * app/(dashboard)/settings/security/sessions/page.tsx — Active session list with device revocation
 *
 * Route:  /settings/security/sessions
 * Auth:   gatewaySSR() — own sessions only (selfOnly prop enforced in SessionsView)
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { SessionsView } from "@/components/auth/SessionsView"

export const metadata = { title: "Your sessions" }

export default async function SessionsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  return <SessionsView userId={gw.userId} selfOnly />
}
