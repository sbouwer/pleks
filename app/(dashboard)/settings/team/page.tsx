/**
 * app/(dashboard)/settings/team/page.tsx — Team & access (Workspace) category page
 *
 * Route:  /settings/team
 * Auth:   Dashboard layout gateway; org-type guard redirects landlord orgs to /settings/details
 * Data:   getCurrentOrgCapabilities() for org-type check; TeamSettingsClient loads members/roles
 * Notes:  Unified header — DetailPageLayout (no tabs), matching the Account category pages.
 */
import { redirect } from "next/navigation"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { TeamSettingsClient } from "./TeamSettingsClient"

export default async function TeamSettingsPage() {
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasTeam) redirect("/settings/details")

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Team & access"
      sub="Invite people, set their roles, and manage who can access this workspace."
      facts={[]}
    >
      <DetailFullWidth>
        <TeamSettingsClient />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
