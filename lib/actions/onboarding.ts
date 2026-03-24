"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createHash } from "crypto"
import { headers } from "next/headers"

export async function createOrganisation(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const name = formData.get("name") as string
  const tradingAs = formData.get("trading_as") as string
  const regNumber = formData.get("reg_number") as string
  const vatNumber = formData.get("vat_number") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const address = formData.get("address") as string

  // Create org
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .insert({
      name,
      trading_as: tradingAs || null,
      reg_number: regNumber || null,
      vat_number: vatNumber || null,
      email,
      phone,
      address: address || null,
    })
    .select("id")
    .single()

  if (orgError || !org) {
    return { error: orgError?.message || "Failed to create organisation" }
  }

  // Create user_orgs (owner role)
  await supabase.from("user_orgs").insert({
    user_id: user.id,
    org_id: org.id,
    role: "owner",
  })

  // Create default subscription (owner/free)
  await supabase.from("subscriptions").insert({
    org_id: org.id,
    tier: "owner",
    status: "active",
    amount_cents: 0,
  })

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: org.id,
    table_name: "organisations",
    record_id: org.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { name, email, phone },
  })

  revalidatePath("/onboarding")
  redirect("/onboarding/receivables")
}

export async function saveReceivables(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const receivables = parseInt(formData.get("monthly_receivables") as string) || 0
  const propertyTypes = formData.getAll("property_types") as string[]

  await supabase
    .from("organisations")
    .update({
      monthly_receivables_cents: receivables * 100,
      property_types: propertyTypes,
    })
    .eq("id", membership.org_id)

  revalidatePath("/onboarding")
  redirect("/onboarding/trust")
}

export async function saveComplianceStep(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const orgId = membership.org_id
  const managementScope = formData.get("management_scope") as string
  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") || "unknown"
  const ua = headersList.get("user-agent") || ""

  const updates: Record<string, unknown> = { management_scope: managementScope }

  // PPRA fields (for scope B or C)
  const ppraStatus = formData.get("ppra_status") as string | null
  if (ppraStatus) {
    updates.ppra_status = ppraStatus
    const ppraFfc = formData.get("ppra_ffc_number") as string | null
    if (ppraFfc) updates.ppra_ffc_number = ppraFfc
  }

  // Deposit account (residential path)
  const hasDepositAccount = formData.get("has_deposit_account")
  if (hasDepositAccount !== null) {
    updates.has_deposit_account = hasDepositAccount === "true"
    updates.deposit_account_type = hasDepositAccount === "true" ? "interest_bearing" : "none"
  }

  // Trust account (PPRA path)
  const hasTrustAccount = formData.get("has_trust_account")
  if (hasTrustAccount !== null) {
    updates.has_trust_account = hasTrustAccount === "true"
    if (hasTrustAccount === "true") {
      updates.trust_account_confirmed_at = new Date().toISOString()
    }
  }

  await supabase.from("organisations").update(updates).eq("id", orgId)

  // Save bank account if provided
  const bankName = formData.get("bank_name") as string | null
  if (bankName) {
    const accountType = formData.get("account_type") as string
    const bankAccountType = ppraStatus === "registered" ? "ppra_trust" : "deposit_holding"

    await supabase.from("bank_accounts").insert({
      org_id: orgId,
      type: bankAccountType,
      bank_name: bankName,
      account_holder: formData.get("account_holder") as string,
      account_number: formData.get("account_number") as string || null,
      branch_code: formData.get("branch_code") as string || null,
      account_type: accountType || null,
      ppra_ref: formData.get("ppra_ref") as string || null,
    })
  }

  // Log consent if declining
  const consentType = formData.get("consent_type") as string | null
  if (consentType) {
    const noticeText = formData.get("notice_text") as string || ""
    const noticeHash = createHash("sha256").update(noticeText).digest("hex")

    await supabase.from("consent_log").insert({
      org_id: orgId,
      user_id: user.id,
      consent_type: consentType,
      consent_given: true,
      consent_version: "1.0",
      ip_address: ip,
      user_agent: ua,
      metadata: {
        scope: managementScope,
        notice_hash: noticeHash,
        feature_restrictions_acknowledged: true,
      },
    })
  }

  // Audit
  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: updates,
  })

  revalidatePath("/onboarding")
  redirect("/onboarding/team")
}

export async function sendTeamInvites(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const emails = formData.getAll("email") as string[]
  const roles = formData.getAll("role") as string[]

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]?.trim()
    const role = roles[i]
    if (!email || !role) continue

    await supabase.from("invites").insert({
      org_id: membership.org_id,
      email,
      role,
      invited_by: user.id,
    })

    // TODO: Send invite email via Resend
  }

  revalidatePath("/onboarding")
}
