/**
 * app/(dashboard)/settings/profile/page.tsx — My profile (Account) category page
 *
 * Route:  /settings/profile  (tabs: ?tab=personal|address|signature)
 * Auth:   gatewaySSR (redirect to /login if no session)
 * Data:   getIdentityForkState (fork banner); resolveAgentContact + fetchAgentContactParty
 *         (Personal/Address — the user's agent contact); getUserSignature (Signature)
 * Notes:  Universal DetailPageLayout + DetailTabs. My profile edits the AGENT contact
 *         (user_profiles.agent_contact_id) — reuses the add-party UI + a PII-safe save. resolveAgentContact
 *         is the create-or-resolve safety net (onboarding is the primary creator). See
 *         ADDENDUM_AGENT_CONTACT_IDENTITY.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getIdentityForkState, getServerUser } from "@/lib/auth/server"
import { IdentityForkBanner } from "@/components/identity/IdentityForkBanner"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { MyProfileForm } from "./MyProfileForm"
import { PROFILE_TABS } from "./tabs"
import { getUserSignature } from "./getSignature"
import { resolveAgentContact } from "@/lib/agent/resolveAgentContact"
import { fetchAgentContactParty } from "@/lib/actions/parties"
import type { PartyFormState } from "@/lib/parties/partyValidation"
import { SignatureSettings } from "./signature/SignatureSettings"

export const metadata = { title: "My Profile" }

export default async function ProfilePage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const forkState = await getIdentityForkState()
  const { tab } = await searchParams
  const active = PROFILE_TABS.some((t) => t.id === tab) ? tab! : "personal"
  const needsContact = active === "personal" || active === "address"

  const signature = active === "signature" ? await getUserSignature(gw.db, gw.userId) : null

  // Resolve (or backfill-create) the agent contact, then load it as a party form for the active tab.
  let contactId: string | null = null
  let profileForm: PartyFormState | null = null
  if (needsContact) {
    const authEmail = (await getServerUser())?.email ?? null
    const resolved = await resolveAgentContact(gw.db, gw.orgId, gw.userId, authEmail)
    if (resolved.ok && resolved.contactId) {
      contactId = resolved.contactId
      const fetched = await fetchAgentContactParty(contactId)
      if (fetched.ok && fetched.form) {
        profileForm = fetched.form
        // Pre-fill the registration email for contacts created before email seeding (saving persists it).
        if (!profileForm.email && authEmail) profileForm.email = authEmail
      }
    }
  }

  return (
    <div>
      {forkState?.forked && !forkState.dismissedAgent && (
        <div className="mb-4"><IdentityForkBanner surface="agent" /></div>
      )}

      <DetailPageLayout
        category="Settings"
        backHref="/settings"
        title="My profile"
        sub="Your personal details, address and signature — as they appear on leases and tenant communications."
        facts={[]}
        tabs={<CategoryTabs tabs={PROFILE_TABS} current={active} />}
      >
        <DetailFullWidth>
          {active === "signature" && <SignatureSettings currentSignature={signature} />}
          {needsContact && (
            contactId && profileForm
              ? <MyProfileForm contactId={contactId} initialForm={profileForm} tab={active as "personal" | "address"} />
              : <div className="rounded-[var(--r-button)] border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">Couldn&apos;t load your profile.</div>
          )}
        </DetailFullWidth>
      </DetailPageLayout>
    </div>
  )
}
