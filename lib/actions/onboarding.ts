"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createHash } from "node:crypto"
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
}

export async function createOrgAndComplete(data: OnboardingData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Check if user already has an org
  const { data: existing } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (existing) {
    redirect("/dashboard")
  }

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") || "unknown"

  // 1. Create organisation
  const { data: org, error: orgError } = await supabase
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
    return { error: orgError?.message || "Failed to create organisation" }
  }

  const orgId = org.id

  // 2. Create user_orgs (owner role)
  await supabase.from("user_orgs").insert({
    user_id: user.id,
    org_id: orgId,
    role: "owner",
  })

  // 3. Create default subscription (owner/free)
  await supabase.from("subscriptions").insert({
    org_id: orgId,
    tier: "owner",
    status: "active",
    amount_cents: 0,
  })

  // 4. Save bank account if provided
  if (data.hasBankAccount && data.bankName) {
    await saveBankAccount(supabase, orgId, data)
  }

  // 5. Log consent if declined bank account
  if (!data.hasBankAccount && data.userType !== "exploring") {
    await logBankAccountDeferred(supabase, orgId, user.id, ip, data.userType)
  }

  // 6. Send team invites
  if (data.invites?.length) {
    await sendInvites(supabase, orgId, user.id, data.invites)
  }

  // 7. Audit log
  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "INSERT",
    changed_by: user.id,
    new_values: {
      action: "onboarding_complete",
      user_type: data.userType,
      name: data.name,
      management_scope: data.managementScope,
    },
  })

  revalidatePath("/dashboard")
  redirect("/dashboard?onboarding=complete")
}

// ─── Helpers (extracted to reduce cognitive complexity) ────

async function saveBankAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  data: OnboardingData
) {
  await supabase.from("bank_accounts").insert({
    org_id: orgId,
    type: data.bankAccountType || "deposit_holding",
    bank_name: data.bankName!,
    account_holder: data.accountHolder || "",
    account_number: data.accountNumber || null,
    branch_code: data.branchCode || null,
    account_type: data.accountType || null,
  })
}

async function logBankAccountDeferred(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  ip: string,
  userType: string
) {
  const noticeText = "Acknowledged deposit/trust account requirement — will set up later"
  const noticeHash = createHash("sha256").update(noticeText).digest("hex")

  await supabase.from("consent_log").insert({
    org_id: orgId,
    user_id: userId,
    consent_type: "bank_account_deferred",
    consent_given: true,
    consent_version: "1.0",
    ip_address: ip,
    user_agent: "",
    metadata: {
      notice_hash: noticeHash,
      user_type: userType,
      feature_restrictions_acknowledged: true,
    },
  })
}

async function sendInvites(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  invites: Array<{ email: string; role: string }>
) {
  for (const invite of invites) {
    if (!invite.email?.trim()) continue
    await supabase.from("invites").insert({
      org_id: orgId,
      email: invite.email.trim(),
      role: invite.role,
      invited_by: userId,
    })
  }
}
