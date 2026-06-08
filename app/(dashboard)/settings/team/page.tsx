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
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { TeamInviteButton } from "./TeamInviteButton"
import { MembersTab } from "./TeamSettingsClient"
import { TransferOwnershipTab } from "./TransferOwnershipTab"
import { TeamsTab, NewTeamButton } from "./TeamsTab"
import { MEMBERS_TAB, TEAMS_TAB, TRANSFER_TAB } from "./tabs"

export default async function TeamSettingsPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasTeam) redirect("/settings/details")

  const isOwner = gw.role === "owner"
  const isFirm = (await getOrgTierCanonical(gw.orgId)) === "firm"  // named teams = firm-tier (ADDENDUM_TEAMS L1)
  const tabs = [
    MEMBERS_TAB,
    ...(isFirm ? [TEAMS_TAB] : []),
    ...(isOwner ? [TRANSFER_TAB] : []),
  ]
  const { tab } = await searchParams
  const active = tabs.some((t) => t.id === tab) ? tab! : "members"

  let body = <MembersTab />
  if (active === "teams" && isFirm) body = <TeamsTab />
  else if (active === "transfer" && isOwner) body = <TransferOwnershipTab />

  return (
    <DetailPageLayout
      fill
      category="Settings"
      backHref="/settings"
      title="Team & access"
      sub="Invite people, set their roles, and manage who can access this workspace."
      facts={[]}
      actions={active === "teams" ? <NewTeamButton /> : <TeamInviteButton />}
      tabs={<CategoryTabs tabs={tabs} current={active} />}
    >
      {body}
    </DetailPageLayout>
  )
}
