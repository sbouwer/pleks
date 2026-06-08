/**
 * app/(dashboard)/settings/profile/page.tsx — My profile (Account) category page
 *
 * Route:  /settings/profile  (tabs: ?tab=personal|contact|signature)
 * Auth:   gatewaySSR (redirect to /login if no session)
 * Data:   getIdentityForkState (fork banner); getOrgDetails (Personal/Contact); getUserSignature (Signature)
 * Notes:  Universal DetailPageLayout + DetailTabs (same iconic template as suppliers). Per-tab server
 *         fetch — only the active tab's data loads. Personal/Contact reuse the shared DetailsForm
 *         sections + /api/org/details (the person/entity split); Signature folds in SignatureSettings.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getIdentityForkState } from "@/lib/auth/server"
import { IdentityForkBanner } from "@/components/identity/IdentityForkBanner"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { MyProfileForm } from "./MyProfileForm"
import { PROFILE_TABS } from "./tabs"
import { getUserSignature } from "./getSignature"
import { getOrgDetails } from "../details/getOrgDetails"
import { SignatureSettings } from "./signature/SignatureSettings"

export const metadata = { title: "My Profile" }

export default async function ProfilePage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const forkState = await getIdentityForkState()
  const { tab } = await searchParams
  const active = PROFILE_TABS.some((t) => t.id === tab) ? tab! : "personal"

  const signature = active === "signature" ? await getUserSignature(gw.db, gw.userId) : null
  const orgDetails = active === "personal" || active === "contact" ? await getOrgDetails(gw.db, gw.orgId) : null

  return (
    <div>
      {forkState?.forked && !forkState.dismissedAgent && (
        <div className="mb-4"><IdentityForkBanner surface="agent" /></div>
      )}

      <DetailPageLayout
        category="Settings"
        backHref="/settings"
        title="My profile"
        sub="Your personal details, contact and signature — as they appear on leases and tenant communications."
        facts={[]}
        tabs={<CategoryTabs tabs={PROFILE_TABS} current={active} />}
      >
        <DetailFullWidth>
          {active === "signature" && <SignatureSettings currentSignature={signature} />}
          {(active === "personal" || active === "contact") && (
            orgDetails
              ? <MyProfileForm initialData={orgDetails} tab={active as "personal" | "contact"} />
              : <div className="rounded-[var(--r-button)] border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">Couldn&apos;t load your details.</div>
          )}
        </DetailFullWidth>
      </DetailPageLayout>
    </div>
  )
}
