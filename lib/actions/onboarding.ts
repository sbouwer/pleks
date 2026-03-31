"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

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
  hasBankAccount: boolean
  bankName?: string
  accountHolder?: string
  accountNumber?: string
  branchCode?: string
  accountType?: string
  bankAccountType?: "trust" | "deposit_holding" | "ppra_trust"
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
  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") || "unknown"
  const service = await createServiceClient()

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

  // Create user_orgs
  const { error: userOrgError } = await service.from("user_orgs").insert({
    user_id: userId,
    org_id: orgId,
    role: "owner",
  })
  if (userOrgError) {
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

  // Save bank account / consent / invites
  if (data.hasBankAccount && data.bankName) {
    const bankError = await saveBankAccount(service, orgId, data)
    if (bankError) {
      console.error("[onboarding] bank_accounts insert failed:", bankError)
      return { error: bankError.message, errorType: "bank_failed" }
    }
  }
  if (!data.hasBankAccount && data.userType !== "exploring") {
    await logBankDeferred(service, orgId, userId, ip, data.userType)
  }
  if (data.invites?.length) {
    await sendInvites(service, orgId, userId, data.invites)
  }

  // Create user profile
  const { error: profileError } = await service.from("user_profiles").upsert({
    id: userId,
    full_name: data.contactName || data.name,
    phone: data.phone || null,
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

  revalidatePath("/dashboard")
  return { ok: true }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

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

async function saveBankAccount(db: ServiceClient, orgId: string, data: OnboardingData) {
  const { error } = await db.from("bank_accounts").insert({
    org_id: orgId,
    type: data.bankAccountType || "deposit_holding",
    bank_name: data.bankName!,
    account_holder: data.accountHolder || "",
    account_number: data.accountNumber || null,
    branch_code: data.branchCode || null,
    account_type: data.accountType || null,
  })
  return error ?? null
}

async function logBankDeferred(db: ServiceClient, orgId: string, userId: string, ip: string, userType: string) {
  const { createHash } = await import("node:crypto")
  const noticeText = "Acknowledged deposit/trust account requirement — will set up later"
  const noticeHash = createHash("sha256").update(noticeText).digest("hex")
  await db.from("consent_log").insert({
    org_id: orgId,
    user_id: userId,
    consent_type: "bank_account_deferred",
    consent_given: true,
    consent_version: "1.0",
    ip_address: ip,
    user_agent: "",
    metadata: { notice_hash: noticeHash, user_type: userType },
  })
}

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
