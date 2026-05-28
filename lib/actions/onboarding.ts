"use server"

/**
 * lib/actions/onboarding.ts — createAccountAndOrg() server action for new agency signup
 *
 * Auth:   public (called before any org exists); new user created via service client admin API
 * Data:   organisations, user_orgs, subscriptions, user_profiles, consent_log, tos_acceptances
 * Notes:  isAlreadyAuthenticated path handles agents who log in first then complete onboarding.
 *         recordTosAcceptance() is gated on data.tosAccepted — never fires without explicit consent.
 *         assertEmailAvailableForRole() enforces I-4 and I-5 before any auth mutation (§4.2–4.3).
 *         Bank/deposit account removed from onboarding (§E) — captured later via dashboard checklist.
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { headers, cookies } from "next/headers"
import { recordTosAcceptance } from "@/lib/subscriptions/acceptance"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { assertEmailAvailableForRole, isPersonalEmailDomain } from "@/lib/auth/email-policy"
import { mapPostgresMembershipError, MembershipRaceLost } from "@/lib/auth/membership"

export interface OnboardingData {
  userType: "owner" | "agent" | "agency" | "family" | "exploring"
  name: string
  tradingAs?: string
  regNumber?: string
  vatNumber?: string
  contactName?: string
  email: string
  phone: string
  address?: string
  managementScope: string
  ppraStatus?: string
  ppraFfcNumber?: string
  tosAccepted: boolean
  invites?: Array<{ email: string; role: string }>
  onboardingComplete: boolean
  // Auth fields (only when creating a new account)
  password?: string
  isAlreadyAuthenticated?: boolean
}

export async function createAccountAndOrg(data: OnboardingData): Promise<{
  ok?: boolean
  error?: string
  errorType?: string
}> {
  // §A: explicit ToS consent is required on every path — never silent-accept
  if (!data.tosAccepted) {
    return { error: "You must accept the Terms to continue", errorType: "tos_required" }
  }

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") || "unknown"
  const ua = headersList.get("user-agent") ?? null
  const service = await createServiceClient()

  const policyError = await checkIdentityPolicy(data)
  if (policyError) return policyError

  const authResult = await resolveUserId(data, service)
  if ("error" in authResult) return authResult
  const userId = authResult.userId

  // Create organisation
  const { data: org, error: orgError } = await service
    .from("organisations")
    .insert({
      name: data.name,
      trading_as: data.tradingAs || null,
      reg_number: data.regNumber || null,
      vat_number: data.vatNumber || null,
      email: data.email,
      phone: data.phone,
      address: data.address || null,
      management_scope: data.managementScope,
      ppra_status: data.ppraStatus || null,
      ppra_ffc_number: data.ppraFfcNumber || null,
      user_type: data.userType,
      onboarding_complete: data.onboardingComplete,
    })
    .select("id")
    .single()

  if (orgError || !org) {
    console.error("[onboarding] organisations insert failed:", orgError)
    return { error: orgError?.message || "Failed to create organisation", errorType: "org_failed" }
  }

  const orgId = org.id

  // Create user_orgs — catches MembershipRaceLost (P0001 from enforce_user_orgs_single_active)
  const { error: userOrgError } = await service.from("user_orgs").insert({
    user_id: userId,
    org_id: orgId,
    role: "owner",
  })
  if (userOrgError) {
    const mapped = mapPostgresMembershipError(userOrgError)
    if (mapped instanceof MembershipRaceLost) {
      return { ok: false, errorType: "membership_race_lost" }
    }
    console.error("[onboarding] user_orgs insert failed:", userOrgError)
    return { error: userOrgError.message, errorType: "user_org_failed" }
  }

  // Create default subscription
  const { error: subError } = await service.from("subscriptions").insert({
    org_id: orgId,
    tier: "owner",
    status: "active",
    amount_cents: 0,
  })
  if (subError) {
    console.error("[onboarding] subscriptions insert failed:", subError)
    return { error: subError.message, errorType: "sub_failed" }
  }

  if (data.invites?.length) {
    await sendInvites(service, orgId, userId, data.invites)
  }

  // Create user profile
  const { error: profileError } = await service.from("user_profiles").upsert({
    id: userId,
    full_name: data.contactName || data.name,
    phone: data.phone || null,
    onboarding_state: "complete",
  }, { onConflict: "id" })
  if (profileError) {
    console.error("[onboarding] user_profiles upsert failed:", profileError)
    return { error: profileError.message, errorType: "profile_failed" }
  }

  // Audit log
  await service.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "INSERT",
    changed_by: userId,
    new_values: {
      action: "onboarding_complete",
      user_type: data.userType,
      name: data.name,
      management_scope: data.managementScope,
    },
  })

  // Record ToS acceptance — gated above on data.tosAccepted; never fires without explicit consent.
  // Also set the cookie so proxy.ts checkTosGate passes without a redirect on first login.
  try {
    await recordTosAcceptance(service, orgId, userId, data.email, ip, ua, "signup")
    const cookieStore = await cookies()
    cookieStore.set("pleks_tos_version", LEGAL_VERSIONS.terms, {
      ...AUTH_COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 365,
    })
    cookieStore.set("pleks_privacy_version", LEGAL_VERSIONS.privacy, {
      ...AUTH_COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 365,
    })
  } catch (tosErr) {
    console.error("[onboarding] recordTosAcceptance failed:", tosErr)
    // Non-fatal — org is created; acceptance can be back-filled via accept-terms gate.
  }

  revalidatePath("/dashboard")
  return { ok: true }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

// ─── Identity policy guard (I-4 + I-5) ───────────────
// Extracted to keep createAccountAndOrg() below the cyclomatic-complexity limit.

async function checkIdentityPolicy(
  data: OnboardingData,
): Promise<{ error: string; errorType: string } | null> {
  const isAgentClass = data.userType === "agent" || data.userType === "agency"

  if (isAgentClass && data.email && isPersonalEmailDomain(data.email)) {
    return { error: "Agent accounts require an organisation email, not a personal address.", errorType: "agent_requires_org_domain" }
  }

  if (!data.email || data.isAlreadyAuthenticated) return null

  const targetClass = isAgentClass ? "agent" : "landlord"
  const availability = await assertEmailAvailableForRole(data.email, targetClass)
  if (availability.available) return null

  if (availability.reason === "in_use_elsewhere") {
    return {
      error: `This email is currently a member of ${availability.existingOrgName}. To use it for a new account, leave that organisation first.`,
      errorType: "email_in_use_elsewhere",
    }
  }
  return { error: "Agent accounts require an organisation email, not a personal address.", errorType: "agent_requires_org_domain" }
}

// ─── Auth resolution ──────────────────────────────────

async function resolveAuthenticatedUser(data: OnboardingData, service: ServiceClient) {
  const supabase = await createClient()
  const sessionUser = (await supabase.auth.getUser()).data.user
  if (sessionUser) return sessionUser

  // Fallback: look up by email via admin API
  if (data.email) {
    const { data: listData } = await service.auth.admin.listUsers({ perPage: 1000 })
    const match = listData?.users?.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase()
    )
    if (match) return match
  }
  return null
}

async function resolveUserId(
  data: OnboardingData,
  service: ServiceClient
): Promise<{ userId: string } | { error: string; errorType: string }> {
  if (data.isAlreadyAuthenticated) {
    const user = await resolveAuthenticatedUser(data, service)
    if (!user) return { error: "Session expired — please sign in again.", errorType: "auth_required" }

    const { data: existing } = await service
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (existing) return { error: "Account already set up", errorType: "already_exists" }
    return { userId: user.id }
  }

  if (!data.email || !data.password) {
    return { error: "Email and password are required", errorType: "validation" }
  }

  const { data: signUpData, error: signUpError } = await service.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.contactName || data.name },
  })

  if (signUpError) {
    if (signUpError.message?.includes("already been registered") || signUpError.message?.includes("already exists")) {
      return { error: "This email already has an account.", errorType: "email_exists" }
    }
    return { error: signUpError.message, errorType: "signup_failed" }
  }

  if (!signUpData.user) {
    return { error: "Failed to create account", errorType: "signup_failed" }
  }

  return { userId: signUpData.user.id }
}

// ─── Helpers ──────────────────────────────────────────

async function sendInvites(db: ServiceClient, orgId: string, userId: string, invites: Array<{ email: string; role: string }>) {
  for (const invite of invites) {
    if (!invite.email?.trim()) continue
    await db.from("invites").insert({
      org_id: orgId,
      email: invite.email.trim(),
      role: invite.role,
      invited_by: userId,
    })
  }
}
