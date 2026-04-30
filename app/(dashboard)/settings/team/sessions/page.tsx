/**
 * app/(dashboard)/settings/team/sessions/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
