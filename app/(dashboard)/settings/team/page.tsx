/**
 * app/(dashboard)/settings/team/page.tsx — Team settings server wrapper; redirects non-team orgs
 *
 * Route:  /settings/team
 * Auth:   Dashboard layout gateway; org-type guard redirects landlord orgs to /settings/details
 * Data:   getCurrentOrgCapabilities() for org-type check
 */
import { redirect } from "next/navigation"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { TeamSettingsClient } from "./TeamSettingsClient"

export default async function TeamSettingsPage() {
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasTeam) redirect("/settings/details")
  return <TeamSettingsClient />
}
