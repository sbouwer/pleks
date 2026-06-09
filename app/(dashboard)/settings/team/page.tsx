/**
 * app/(dashboard)/settings/team/page.tsx — Team & access (Workspace) category page
 *
 * Route:  /settings/team  (tabs: ?tab=members|transfer)
 * Auth:   gatewaySSR; org-type guard redirects landlord orgs to /settings/details
 * Data:   getCurrentOrgCapabilities (org-type); gw.role for owner-gating; tabs self-load
 * Notes:  DetailPageLayout + DetailTabs. Invite is a header quick-action (TeamInviteButton). The
 *         Transfer-ownership tab is OWNER-ONLY — hidden for non-owners, and ?tab=transfer falls back to
 *         Members for them.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { canAddCustomRoles } from "@/lib/auth/roleTiers"
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { TeamInviteButton } from "./TeamInviteButton"
import { MembersTab } from "./TeamSettingsClient"
import { TransferOwnershipTab } from "./TransferOwnershipTab"
import { TeamsTab, NewTeamButton } from "./TeamsTab"
import { RolesTab } from "./RolesTab"
import { NewRoleButton } from "./RolesManager"
import { MEMBERS_TAB, TEAMS_TAB, ROLES_TAB, TRANSFER_TAB } from "./tabs"

export default async function TeamSettingsPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasTeam) redirect("/settings/details")

  const isOwner = gw.role === "owner"
  const tier = await getOrgTierCanonical(gw.orgId)
  const isFirm = tier === "firm"  // named teams = firm-tier (ADDENDUM_TEAMS L1)
  const canAddRole = canAddCustomRoles(tier)  // custom roles = Firm/Bespoke only
  const tabs = [
    MEMBERS_TAB,
    ...(isFirm ? [TEAMS_TAB] : []),
    ...(isOwner ? [ROLES_TAB, TRANSFER_TAB] : []),
  ]
  const { tab } = await searchParams
  const active = tabs.some((t) => t.id === tab) ? tab! : "members"

  let body = <MembersTab />
  let sub = "Invite people, set their roles, and manage who can access this workspace."
  if (active === "teams" && isFirm) {
    body = <TeamsTab />
    sub = "Group members into teams — work can be assigned to a team, and every member sees it until someone picks it up."
  } else if (active === "roles" && isOwner) {
    body = <RolesTab />
    sub = "Define the roles in your agency and what each can access."
  } else if (active === "transfer" && isOwner) {
    body = <TransferOwnershipTab />
  }

  let headerAction: React.ReactNode = <TeamInviteButton />
  if (active === "teams") headerAction = <NewTeamButton />
  else if (active === "roles") headerAction = canAddRole ? <NewRoleButton /> : null

  return (
    <DetailPageLayout
      fill
      category="Settings"
      backHref="/settings"
      title="Team & access"
      sub={sub}
      facts={[]}
      actions={headerAction}
      tabs={<CategoryTabs tabs={tabs} current={active} />}
    >
      {body}
    </DetailPageLayout>
  )
}
