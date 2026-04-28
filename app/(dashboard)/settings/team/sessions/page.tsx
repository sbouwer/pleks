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
