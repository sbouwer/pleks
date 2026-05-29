/**
 * app/(onboarding)/welcome/page.tsx — First-run Welcome interstitial for agent-class users
 *
 * Route:  /welcome
 * Auth:   authenticated agent (AAL1 island — requiresAal2 not set; TOTP not yet enrolled)
 * Data:   user_profiles (welcome_seen, full_name), user_orgs + organisations (role, org name,
 *         management_scope, user_type), activation_delegations (delegation preview)
 * Notes:  §B/§F.3 — two entry points: onboarding completion + agent-class invite acceptance.
 *         welcome_seen is per-user; founder and invited letting agent in same org each see it once.
 *         welcome_seen set on "Continue" click (markWelcomeSeen action) — not on first render —
 *         so the TOTP-link → /welcome?step=passkey return works cleanly.
 *         Demo/exploring path (decision 1): never calls createAccountAndOrg, never lands here.
 *         Delegation preview: reads activation_delegations; empty until §C ships writes.
 *         Portal-class welcome (Phase 2): tenant/landlord/supplier not handled here.
 */
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import WelcomeClient from "./WelcomeClient"

interface PageProps {
  searchParams: Promise<{ step?: string; redirect?: string }>
}

export default async function WelcomePage({ searchParams }: Readonly<PageProps>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const { data: profile, error: profileErr } = await service
    .from("user_profiles")
    .select("full_name, welcome_seen")
    .eq("id", user.id)
    .single()

  if (profileErr) {
    console.error("[welcome] profile fetch failed:", profileErr.message)
  }

  const { step, redirect: redirectParam } = await searchParams
  const safeNext = safeRedirect(redirectParam, "/dashboard")

  // Already completed Welcome → thread redirect param through to resolver
  if (profile?.welcome_seen) {
    redirect(`/auth/resolver?redirect=${encodeURIComponent(safeNext)}`)
  }

  const { data: membership, error: memberErr } = await service
    .from("user_orgs")
    .select("role, org_id, organisations(name, management_scope, user_type)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (memberErr) {
    console.error("[welcome] membership fetch failed:", memberErr.message)
  }

  const orgId = membership?.org_id ?? null
  const org = membership?.organisations as unknown as {
    name: string; management_scope: string | null; user_type: string | null
  } | null
  const orgName = org?.name ?? ""
  const role = membership?.role ?? "agent"
  const handlesClientFunds = org?.management_scope === "others_only"
    || org?.user_type === "agent"
    || org?.user_type === "agency"
  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? ""

  // Delegation preview for invited staff — §C owns the writes; here we read for orientation
  let delegationCount = 0
  let delegatedByName = ""
  if (orgId) {
    const { data: delegations } = await service
      .from("activation_delegations")
      .select("item_key, delegated_by")
      .eq("org_id", orgId)
      .eq("delegated_to", user.id)

    if (delegations && delegations.length > 0) {
      delegationCount = delegations.length
      const ownerId = delegations[0].delegated_by as string
      const { data: ownerProfile } = await service
        .from("user_profiles")
        .select("full_name")
        .eq("id", ownerId)
        .single()
      delegatedByName = ownerProfile?.full_name?.split(" ")[0] ?? "Your manager"
    }
  }

  return (
    <WelcomeClient
      firstName={firstName}
      orgName={orgName}
      role={role}
      delegationCount={delegationCount}
      delegatedByName={delegatedByName}
      initialStep={step === "passkey" ? "passkey" : "orient"}
      handlesClientFunds={handlesClientFunds}
      redirect={safeNext}
    />
  )
}
