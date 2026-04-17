"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

type LeaseFormFields = {
  unitId: string
  propertyId: string
  tenantId: string
  leaseType: string
  tenantIsJuristic: boolean
  cpaApplies: boolean
  startDate: string
  endDate: string | null
  isFixedTerm: boolean
  noticePeriod: number
  rentCents: number
  paymentDueDay: string
  escalationPercent: number
  escalationType: string
  depositCents: number | null
  depositInterestTo: string
  depositInterestRatePercent: number | null
  arrearsInterestEnabled: boolean
  arrearsInterestMarginPercent: number
  specialTerms: unknown[]
  escalationReviewDate: string
  autoRenewalNoticeDue: string | null
}

function parseLeaseFormData(formData: FormData): LeaseFormFields {
  const leaseType = (formData.get("lease_type") as string) || "residential"
  const cpaApplies = formData.get("cpa_applies") !== "false"
  const startDate = formData.get("start_date") as string
  const endDate = (formData.get("end_date") as string) || null
  const isFixedTerm = formData.get("is_fixed_term") !== "false"

  const startDateObj = new Date(startDate)
  const escalationReviewDate = new Date(startDateObj)
  escalationReviewDate.setFullYear(escalationReviewDate.getFullYear() + 1)

  let autoRenewalNoticeDue: string | null = null
  if (endDate && cpaApplies && isFixedTerm) {
    const endDateObj = new Date(endDate)
    endDateObj.setDate(endDateObj.getDate() - 40)
    autoRenewalNoticeDue = endDateObj.toISOString().split("T")[0]
  }

  const depositInterestRateRaw = formData.get("deposit_interest_rate") as string
  const specialTermsRaw = formData.get("special_terms") as string
  let specialTerms: unknown[] = []
  try { specialTerms = specialTermsRaw ? JSON.parse(specialTermsRaw) : [] } catch { /* empty */ }

  return {
    unitId: formData.get("unit_id") as string,
    propertyId: formData.get("property_id") as string,
    tenantId: formData.get("tenant_id") as string,
    leaseType,
    tenantIsJuristic: formData.get("tenant_is_juristic") === "true",
    cpaApplies,
    startDate,
    endDate,
    isFixedTerm,
    noticePeriod: Number.parseInt(formData.get("notice_period_days") as string) || 20,
    rentCents: Math.round(Number.parseFloat(formData.get("rent_amount") as string) * 100),
    paymentDueDay: (formData.get("payment_due_day") as string) || "1",
    escalationPercent: Number.parseFloat(formData.get("escalation_percent") as string) || 10,
    escalationType: (formData.get("escalation_type") as string) || "fixed",
    depositCents: formData.get("deposit_amount")
      ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100)
      : null,
    depositInterestTo: leaseType === "residential" ? "tenant" : ((formData.get("deposit_interest_to") as string) || "landlord"),
    depositInterestRatePercent: depositInterestRateRaw ? Number.parseFloat(depositInterestRateRaw) : null,
    arrearsInterestEnabled: formData.get("arrears_interest_enabled") !== "false",
    arrearsInterestMarginPercent: Number.parseFloat(formData.get("arrears_interest_margin") as string) || 2,
    specialTerms,
    escalationReviewDate: escalationReviewDate.toISOString().split("T")[0],
    autoRenewalNoticeDue,
  }
}

type DbClient = Awaited<ReturnType<typeof gateway>> extends null ? never : Awaited<ReturnType<typeof gateway>> extends infer T ? T extends { db: infer D } ? D : never : never

async function insertLeaseCharges(db: DbClient, formData: FormData, leaseId: string, orgId: string, userId: string) {
  const chargesJsonRaw = formData.get("charges_json") as string | null
  if (!chargesJsonRaw) return
  try {
    const charges = JSON.parse(chargesJsonRaw) as {
      description: string; charge_type: string; amount_cents: number
      start_date: string; end_date: string | null; payable_to: string; deduct_from_owner_payment: boolean
    }[]
    if (charges.length > 0) {
      await db.from("lease_charges").insert(
        charges.map((c) => ({
          org_id: orgId, lease_id: leaseId, description: c.description, charge_type: c.charge_type,
          amount_cents: c.amount_cents, start_date: c.start_date, end_date: c.end_date ?? null,
          payable_to: c.payable_to, deduct_from_owner_payment: c.deduct_from_owner_payment, created_by: userId,
        }))
      )
    }
  } catch { /* ignore malformed charges */ }
}

async function insertCoTenants(db: DbClient, formData: FormData, leaseId: string, orgId: string): Promise<string[]> {
  const coTenantsRaw = formData.get("co_tenants_json") as string | null
  if (!coTenantsRaw) return []
  try {
    const coTenantIds = JSON.parse(coTenantsRaw) as string[]
    if (coTenantIds.length > 0) {
      await db.from("lease_co_tenants").insert(
        coTenantIds.map((tid) => ({ org_id: orgId, lease_id: leaseId, tenant_id: tid }))
      )
    }
    return coTenantIds
  } catch { /* ignore malformed */ }
  return []
}

async function saveClauseSelections(db: DbClient, formData: FormData, leaseId: string, orgId: string, propertyId: string) {
  const clauseSelectionsRaw = formData.get("clause_selections") as string | null
  if (clauseSelectionsRaw) {
    try {
      const clauseSelections = JSON.parse(clauseSelectionsRaw) as Record<string, boolean>
      const rows = Object.entries(clauseSelections).map(([clause_key, enabled]) => ({
        org_id: orgId, lease_id: leaseId, clause_key, enabled,
      }))
      if (rows.length > 0) {
        await db.from("lease_clause_selections").upsert(rows, {
          onConflict: "org_id,lease_id,clause_key", ignoreDuplicates: false,
        })
      }
    } catch { /* ignore malformed */ }
  }

  // HOA supremacy clause — auto-insert (non-removable) for sectional title properties with a managing scheme
  const { data: propMeta } = await db
    .from("properties").select("is_sectional_title, managing_scheme_id").eq("id", propertyId).single()
  if (propMeta?.is_sectional_title && propMeta.managing_scheme_id) {
    await db.from("lease_clause_selections").upsert({
      org_id: orgId, lease_id: leaseId, clause_key: "hoa_supremacy", enabled: true,
    }, { onConflict: "org_id,lease_id,clause_key", ignoreDuplicates: false })
  }
}

async function logAcknowledgedConflicts(db: DbClient, formData: FormData, leaseId: string, orgId: string, userId: string) {
  const acknowledgedConflictsRaw = formData.get("acknowledged_conflicts") as string | null
  if (!acknowledgedConflictsRaw) return
  try {
    const conflictIds = JSON.parse(acknowledgedConflictsRaw) as string[]
    if (conflictIds.length > 0) {
      await db.from("audit_log").insert({
        org_id: orgId, table_name: "leases", record_id: leaseId,
        action: "CONFLICT_ACKNOWLEDGED", changed_by: userId,
        new_values: { acknowledged_conflict_ids: conflictIds },
      })
    }
  } catch { /* ignore malformed */ }
}

export async function createLease(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const f = parseLeaseFormData(formData)

  const { data: lease, error } = await db
    .from("leases")
    .insert({
      org_id: orgId,
      unit_id: f.unitId,
      property_id: f.propertyId,
      tenant_id: f.tenantId,
      lease_type: f.leaseType,
      tenant_is_juristic: f.tenantIsJuristic,
      cpa_applies: f.cpaApplies,
      start_date: f.startDate,
      end_date: f.endDate,
      is_fixed_term: f.isFixedTerm,
      notice_period_days: f.noticePeriod,
      rent_amount_cents: f.rentCents,
      payment_due_day: f.paymentDueDay,
      escalation_percent: f.escalationPercent,
      escalation_type: f.escalationType,
      escalation_review_date: f.escalationReviewDate,
      deposit_amount_cents: f.depositCents,
      deposit_interest_to: f.depositInterestTo,
      special_terms: f.specialTerms,
      auto_renewal_notice_due: f.autoRenewalNoticeDue,
      deposit_interest_rate_percent: f.depositInterestRatePercent,
      arrears_interest_enabled: f.arrearsInterestEnabled,
      arrears_interest_margin_percent: f.arrearsInterestMarginPercent,
      template_type: f.leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      template_source: "pleks",
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single()

  if (error || !lease) {
    return { error: error?.message || "Failed to create lease" }
  }

  await insertLeaseCharges(db, formData, lease.id, orgId, userId)
  const coTenantIds = await insertCoTenants(db, formData, lease.id, orgId)
  await saveClauseSelections(db, formData, lease.id, orgId, f.propertyId)
  await logAcknowledgedConflicts(db, formData, lease.id, orgId, userId)

  // Save tenant messaging consent
  const consentEmail = formData.get("consent_email") === "true"
  const consentWhatsApp = formData.get("consent_whatsapp") === "true"
  const consentSms = formData.get("consent_sms") === "true"
  const { saveLeaseConsent } = await import("./consent")
  await saveLeaseConsent({
    tenantId: f.tenantId,
    orgId,
    emailEnabled: consentEmail,
    whatsappEnabled: consentWhatsApp,
    smsEnabled: consentSms,
  })

  // Reflect draft tenant on the unit so the property page shows who is linked
  await db.from("units").update({
    prospective_tenant_id: f.tenantId,
    prospective_co_tenant_ids: coTenantIds,
  }).eq("id", f.unitId)

  await db.from("audit_log").insert({
    org_id: orgId, table_name: "leases", record_id: lease.id, action: "INSERT", changed_by: userId,
    new_values: { tenant_id: f.tenantId, unit_id: f.unitId, lease_type: f.leaseType, rent_cents: f.rentCents },
  })

  revalidatePath("/leases")
  redirect(`/leases/${lease.id}`)
}

export async function createUploadedLease(formData: FormData): Promise<{ error: string } | { leaseId: string }> {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const tenantId = formData.get("tenant_id") as string
  const leaseType = (formData.get("lease_type") as string) || "residential"
  const tenantIsJuristic = formData.get("tenant_is_juristic") === "true"
  const cpaApplies = formData.get("cpa_applies") !== "false"

  const startDate = formData.get("start_date") as string
  const endDate = (formData.get("end_date") as string) || null
  const isFixedTerm = formData.get("is_fixed_term") !== "false"
  const noticePeriod = Number.parseInt(formData.get("notice_period_days") as string) || 20

  const rentCents = Math.round(Number.parseFloat(formData.get("rent_amount") as string) * 100)
  const paymentDueDay = (formData.get("payment_due_day") as string) || "1"
  const escalationPercent = Number.parseFloat(formData.get("escalation_percent") as string) || 8
  const escalationType = (formData.get("escalation_type") as string) || "fixed"
  const depositCents = formData.get("deposit_amount")
    ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100)
    : null

  const startDateObj = new Date(startDate)
  const escalationReviewDate = new Date(startDateObj)
  escalationReviewDate.setFullYear(escalationReviewDate.getFullYear() + 1)

  let autoRenewalNoticeDue: string | null = null
  if (endDate && cpaApplies && isFixedTerm) {
    const endDateObj = new Date(endDate)
    endDateObj.setDate(endDateObj.getDate() - 40)
    autoRenewalNoticeDue = endDateObj.toISOString().split("T")[0]
  }

  const { data: lease, error } = await db
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
      deposit_interest_to: leaseType === "residential" ? "tenant" : "landlord",
      auto_renewal_notice_due: autoRenewalNoticeDue,
      template_source: "uploaded",
      template_type: leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single()

  if (error || !lease) {
    return { error: error?.message || "Failed to create lease" }
  }

  const leaseId = lease.id

  // Insert co-tenants
  const coTenantsRaw = formData.get("co_tenants_json") as string | null
  if (coTenantsRaw) {
    try {
      const coTenantIds = JSON.parse(coTenantsRaw) as string[]
      if (coTenantIds.length > 0) {
        await db.from("lease_co_tenants").insert(
          coTenantIds.map((tid) => ({ org_id: orgId, lease_id: leaseId, tenant_id: tid }))
        )
        await db.from("units").update({
          prospective_tenant_id: tenantId,
          prospective_co_tenant_ids: coTenantIds,
        }).eq("id", unitId)
      }
    } catch { /* ignore malformed */ }
  } else {
    await db.from("units").update({ prospective_tenant_id: tenantId }).eq("id", unitId)
  }

  // Upload PDF to storage if provided
  const file = formData.get("document")
  if (file instanceof File && file.size > 0) {
    try {
      const path = `lease-documents/${orgId}/${leaseId}/uploaded-lease.pdf`
      const bytes = await file.arrayBuffer()
      const { error: uploadError } = await db.storage
        .from("lease-documents")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true })
      if (!uploadError) {
        await db.from("leases").update({ external_document_path: path }).eq("id", leaseId)
      }
    } catch { /* non-fatal — user can upload later */ }
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "leases",
    record_id: leaseId,
    action: "INSERT",
    changed_by: userId,
    new_values: { tenant_id: tenantId, unit_id: unitId, lease_type: leaseType, rent_cents: rentCents, template_source: "uploaded" },
  })

  revalidatePath("/leases")
  return { leaseId }
}

export async function markAsSigned(leaseId: string) {
  const { activateLeaseCascade } = await import("@/lib/leases/activateLeaseCascade")
  const { checkLeasePrerequisites } = await import("@/lib/leases/checkPrerequisites")

  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const prereqs = await checkLeasePrerequisites(db, leaseId, orgId)
  if (!prereqs.canProceed) {
    return { error: `${prereqs.failCount} prerequisite(s) not met` }
  }

  try {
    const result = await activateLeaseCascade(db, leaseId, orgId, "manual", userId)
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath("/leases")
    return { success: true, steps: result.steps }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function sendForSigning(leaseId: string) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const { data: lease } = await db
    .from("leases")
    .select("status, generated_doc_path")
    .eq("id", leaseId)
    .single()

  if (!lease) return { error: "Lease not found" }
  if (!lease.generated_doc_path) return { error: "Generate the lease document first" }

  await db.from("leases").update({ status: "pending_signing" }).eq("id", leaseId)

  await db.from("lease_lifecycle_events").insert({
    org_id: orgId,
    lease_id: leaseId,
    event_type: "lease_sent_for_signing",
    description: "Lease sent for digital signing via DocuSeal",
    triggered_by: "agent",
    triggered_by_user: userId,
  })

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

export async function giveNotice(leaseId: string, givenBy: "tenant" | "landlord", reason?: string) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId } = gw

  const { data: lease } = await db.from("leases").select("*").eq("id", leaseId).single()
  if (!lease) return { error: "Lease not found" }

  const noticeDate = new Date()
  const noticePeriodEnd = new Date(noticeDate)
  noticePeriodEnd.setDate(noticePeriodEnd.getDate() + (lease.notice_period_days || 20))

  await db.from("leases").update({
    status: "notice",
    notice_given_by: givenBy,
    notice_given_date: noticeDate.toISOString().split("T")[0],
    notice_period_end: noticePeriodEnd.toISOString().split("T")[0],
  }).eq("id", leaseId)

  await db.from("units").update({ status: "notice" }).eq("id", lease.unit_id)

  await db.from("unit_status_history").insert({
    unit_id: lease.unit_id,
    org_id: lease.org_id,
    from_status: "occupied",
    to_status: "notice",
    changed_by: userId,
    reason: reason ? `Notice given by ${givenBy}: ${reason}` : `Notice given by ${givenBy}`,
  })

  await db.from("audit_log").insert({
    org_id: lease.org_id,
    table_name: "leases",
    record_id: leaseId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { status: "notice", notice_given_by: givenBy, notice_given_date: noticeDate.toISOString() },
  })

  revalidatePath(`/leases/${leaseId}`)
  revalidatePath("/leases")
  return { success: true }
}

export async function addLeaseCoTenant(leaseId: string, tenantId: string): Promise<{ error: string } | { success: true }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { data: lease } = await db.from("leases").select("org_id").eq("id", leaseId).single()
  if (lease?.org_id !== orgId) return { error: "Lease not found" }

  const { error } = await db.from("lease_co_tenants").insert({ org_id: orgId, lease_id: leaseId, tenant_id: tenantId })
  if (error) return { error: error.message }

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

export async function removeLeaseCoTenant(leaseId: string, tenantId: string): Promise<{ error: string } | { success: true }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { data: lease } = await db.from("leases").select("org_id").eq("id", leaseId).single()
  if (lease?.org_id !== orgId) return { error: "Lease not found" }

  const { error } = await db.from("lease_co_tenants").delete().eq("lease_id", leaseId).eq("tenant_id", tenantId)
  if (error) return { error: error.message }

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}
