/**
 * app/(dashboard)/settings/team/sessions/page.tsx — team sessions admin: view/revoke team members' active sessions
 *
 * Route:  /settings/team/sessions
 * Auth:   gatewaySSR(); restricted to owner/property_manager (else /403)
 * Data:   Delegated to TeamSessionsView (scoped by orgId)
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { TeamSessionsView } from "@/components/auth/TeamSessionsView"

export const metadata = { title: "Team sessions" }

export default async function TeamSessionsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  if (!["owner", "property_manager"].includes(gw.role)) {
    redirect("/403")
  }

  return <TeamSessionsView orgId={gw.orgId} />
}
