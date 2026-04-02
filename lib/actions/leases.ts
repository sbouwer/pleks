"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createLease(formData: FormData) {
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

  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const tenantId = formData.get("tenant_id") as string
  const leaseType = formData.get("lease_type") as string || "residential"
  const tenantIsJuristic = formData.get("tenant_is_juristic") === "true"
  const cpaApplies = formData.get("cpa_applies") !== "false"

  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string || null
  const isFixedTerm = formData.get("is_fixed_term") !== "false"
  const noticePeriod = parseInt(formData.get("notice_period_days") as string) || 20

  const rentCents = Math.round(parseFloat(formData.get("rent_amount") as string) * 100)
  const paymentDueDay = parseInt(formData.get("payment_due_day") as string) || 1
  const escalationPercent = parseFloat(formData.get("escalation_percent") as string) || 10
  const escalationType = formData.get("escalation_type") as string || "fixed"
  const depositCents = formData.get("deposit_amount")
    ? Math.round(parseFloat(formData.get("deposit_amount") as string) * 100)
    : null
  const depositInterestTo = leaseType === "residential" ? "tenant" : (formData.get("deposit_interest_to") as string || "landlord")

  // Interest settings
  const depositInterestRateRaw = formData.get("deposit_interest_rate") as string
  const depositInterestRatePercent = depositInterestRateRaw ? Number.parseFloat(depositInterestRateRaw) : null
  const arrearsInterestEnabled = formData.get("arrears_interest_enabled") !== "false"
  const arrearsInterestMarginPercent = Number.parseFloat(formData.get("arrears_interest_margin") as string) || 2

  // Addendum C
  const propertyRulesId = formData.get("property_rules_id") as string || null

  // Addendum D
  const specialTermsRaw = formData.get("special_terms") as string
  let specialTerms: unknown[] = []
  try { specialTerms = specialTermsRaw ? JSON.parse(specialTermsRaw) : [] } catch { /* empty */ }

  // Calculate escalation review date (start + 12 months)
  const startDateObj = new Date(startDate)
  const escalationReviewDate = new Date(startDateObj)
  escalationReviewDate.setFullYear(escalationReviewDate.getFullYear() + 1)

  // Calculate CPA auto-renewal notice due (end_date - 40 calendar days as proxy for 20 business days)
  let autoRenewalNoticeDue: string | null = null
  if (endDate && cpaApplies && isFixedTerm) {
    const endDateObj = new Date(endDate)
    endDateObj.setDate(endDateObj.getDate() - 40)
    autoRenewalNoticeDue = endDateObj.toISOString().split("T")[0]
  }

  const { data: lease, error } = await supabase
    .from("leases")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: propertyId,
      tenant_id: tenantId,
      lease_type: leaseType,
      tenant_is_juristic: tenantIsJuristic,
      cpa_applies: cpaApplies,
      start_date: startDate,
      end_date: endDate,
      is_fixed_term: isFixedTerm,
      notice_period_days: noticePeriod,
      rent_amount_cents: rentCents,
      payment_due_day: paymentDueDay,
      escalation_percent: escalationPercent,
      escalation_type: escalationType,
      escalation_review_date: escalationReviewDate.toISOString().split("T")[0],
      deposit_amount_cents: depositCents,
      deposit_interest_to: depositInterestTo,
      property_rules_id: propertyRulesId,
      special_terms: specialTerms,
      auto_renewal_notice_due: autoRenewalNoticeDue,
      deposit_interest_rate_percent: depositInterestRatePercent,
      arrears_interest_enabled: arrearsInterestEnabled,
      arrears_interest_margin_percent: arrearsInterestMarginPercent,
      template_type: leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single()

  if (error || !lease) {
    return { error: error?.message || "Failed to create lease" }
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "leases",
    record_id: lease.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { tenant_id: tenantId, unit_id: unitId, lease_type: leaseType, rent_cents: rentCents },
  })

  revalidatePath("/leases")
  redirect(`/leases/${lease.id}`)
}

export async function markAsSigned(leaseId: string) {
  const { activateLeaseCascade } = await import("@/lib/leases/activateLeaseCascade")
  const { checkLeasePrerequisites } = await import("@/lib/leases/checkPrerequisites")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) return { error: "No org" }

  const prereqs = await checkLeasePrerequisites(supabase, leaseId, membership.org_id)
  if (!prereqs.canProceed) {
    return { error: `${prereqs.failCount} prerequisite(s) not met` }
  }

  try {
    const result = await activateLeaseCascade(supabase, leaseId, membership.org_id, "manual", user.id)
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath("/leases")
    return { success: true, steps: result.steps }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function sendForSigning(leaseId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) return { error: "No org" }

  const { data: lease } = await supabase
    .from("leases")
    .select("status, generated_doc_path")
    .eq("id", leaseId)
    .single()

  if (!lease) return { error: "Lease not found" }
  if (!lease.generated_doc_path) return { error: "Generate the lease document first" }

  await supabase.from("leases").update({ status: "pending_signing" }).eq("id", leaseId)

  await supabase.from("lease_lifecycle_events").insert({
    org_id: membership.org_id,
    lease_id: leaseId,
    event_type: "lease_sent_for_signing",
    description: "Lease sent for digital signing via DocuSeal",
    triggered_by: "agent",
    triggered_by_user: user.id,
  })

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

export async function giveNotice(leaseId: string, givenBy: "tenant" | "landlord", reason?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: lease } = await supabase.from("leases").select("*").eq("id", leaseId).single()
  if (!lease) return { error: "Lease not found" }

  const noticeDate = new Date()
  const noticePeriodEnd = new Date(noticeDate)
  noticePeriodEnd.setDate(noticePeriodEnd.getDate() + (lease.notice_period_days || 20))

  await supabase.from("leases").update({
    status: "notice",
    notice_given_by: givenBy,
    notice_given_date: noticeDate.toISOString().split("T")[0],
    notice_period_end: noticePeriodEnd.toISOString().split("T")[0],
  }).eq("id", leaseId)

  await supabase.from("units").update({ status: "notice" }).eq("id", lease.unit_id)

  await supabase.from("unit_status_history").insert({
    unit_id: lease.unit_id,
    org_id: lease.org_id,
    from_status: "occupied",
    to_status: "notice",
    changed_by: user.id,
    reason: `Notice given by ${givenBy}${reason ? `: ${reason}` : ""}`,
  })

  await supabase.from("audit_log").insert({
    org_id: lease.org_id,
    table_name: "leases",
    record_id: leaseId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { status: "notice", notice_given_by: givenBy, notice_given_date: noticeDate.toISOString() },
  })

  revalidatePath(`/leases/${leaseId}`)
  revalidatePath("/leases")
  return { success: true }
}
