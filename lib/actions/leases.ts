"use server"

/**
 * lib/actions/leases.ts — server actions for lease lifecycle (create, sign, activate, notice, terminate)
 *
 * Auth:   requireAgentWriteAccess (subscription-gated)
 * Data:   leases, tenants, units, properties, lease_charges, audit_log, communication_log
 * Notes:  BUILD_63 Phase 5: L1 fires in sendForSigning, L10 fires in giveNotice (tenant-only),
 *         L4+P1 fire in activateLeaseCascade. L11 fires from lease-expiry-check cron.
 *         Both create actions accept an optional application_id (approval → lease, arc 2 B2): validated against
 *         the tenant + unit, stamped on originating_application_id, and back-linked via applicationLink.ts.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { getLeaseCreationGate, LEASE_GATE_BLOCKED_MESSAGE } from "@/lib/leases/leaseCreationGate"
import { recordAudit } from "@/lib/audit/recordAudit"
import { gateway, type GatewayContext } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import * as React from "react"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { LeaseCreatedEmail } from "@/lib/comms/templates/tenant/leases/lease-created"
import { LeaseNoticeAcknowledgedEmail } from "@/lib/comms/templates/tenant/leases/lease-notice-acknowledged"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { addCalendarDays, addCalendarMonths, fmtDateLongZA, saTodayISO } from "@/lib/dates"
import { formatZAR, type OrgType } from "@/lib/constants"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import { parseLeaseFormData } from "@/lib/leases/leaseFormFields"
import { rendersLeaseDocument } from "@/lib/leases/leaseSource"
import { checkOriginatingApplication, insertLeaseClaimingApplication } from "@/lib/leases/applicationLink"
import { releaseLeaseStartMarker } from "@/lib/leases/leaseStartMarker"
import { mandatoryGate, MissingMandatoryFieldsError, recomputeIncompleteMandatory } from "@/lib/migration/mandatoryGate"
import { changedTerms, parseLeaseTermsEdit, SELECTABLE_ESCALATION_TYPES, type LeaseTermsInput } from "@/lib/leases/leaseTermsEdit"


type DbClient = GatewayContext["db"]

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

interface CoTenantInput { tenant_id: string; is_signatory: boolean }

/** Parse co_tenants_json — accepts the new {tenant_id,is_signatory}[] shape and the legacy string[] (→ not a
 *  signatory). Co-lessees and company signatories share lease_co_tenants; is_signatory marks which ones sign. */
function parseCoTenants(raw: string | null): CoTenantInput[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<string | { tenant_id?: string; is_signatory?: boolean }>
    return parsed
      .map((x) => (typeof x === "string"
        ? { tenant_id: x, is_signatory: false }
        : { tenant_id: x.tenant_id ?? "", is_signatory: !!x.is_signatory }))
      .filter((c) => c.tenant_id)
  } catch {
    return []
  }
}

async function insertCoTenants(db: DbClient, formData: FormData, leaseId: string, orgId: string): Promise<string[]> {
  const co = parseCoTenants(formData.get("co_tenants_json") as string | null)
  if (co.length > 0) {
    await db.from("lease_co_tenants").insert(
      co.map((c) => ({ org_id: orgId, lease_id: leaseId, tenant_id: c.tenant_id, is_signatory: c.is_signatory }))
    )
  }
  return co.map((c) => c.tenant_id)
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
  const { data: propMeta, error: propMetaError } = await db
    .from("properties").select("is_sectional_title, managing_scheme_id").eq("id", propertyId).eq("org_id", orgId).single() // org-scope guard (caller-ID census)
    logQueryError("saveClauseSelections properties", propMetaError)
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
      await recordAudit(db, { orgId: orgId, table: "leases", recordId: leaseId, action: "CONFLICT_ACKNOWLEDGED", actorId: userId, after: { acknowledged_conflict_ids: conflictIds } })
    }
  } catch { /* ignore malformed */ }
}

/**
 * Per-UNIT overlap guard: a new lease may only start the day AFTER the unit's current in-force lease ends.
 * Returns a human-readable block message, or null if the slot is free. Drafts/expired/cancelled don't block
 * (a unit can hold multiple drafts; only in-force leases — active/month_to_month/notice — occupy the slot).
 */
async function findLeaseOverlapBlock(
  db: DbClient, orgId: string, unitId: string | null, startDate: string | null,
): Promise<string | null> {
  if (!unitId || !startDate) return null
  const { data: inForce, error } = await db
    .from("leases")
    .select("id, status, end_date")
    .eq("org_id", orgId)
    .eq("unit_id", unitId)
    .in("status", ["active", "month_to_month", "notice"])
  logQueryError("findLeaseOverlapBlock leases", error)
  if (!inForce?.length) return null

  for (const l of inForce) {
    if (!l.end_date) {
      return "This unit has an ongoing month-to-month lease. End that lease before creating a new one for this unit."
    }
    if (startDate <= l.end_date) {
      // setDate/getDate were LOCAL-time accessors and the result was sliced in UTC — mixed coordinates.
      const next = addCalendarDays(l.end_date as string, 1)
      return `This unit is leased until ${l.end_date}. A new lease must start on or after ${next}.`
    }
  }
  return null
}

export async function createLease(formData: FormData) {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw

  // Hard gate: an agency org can't create leases until its trust/deposit banking is configured.
  const gate = await getLeaseCreationGate(db, orgId)
  if (!gate.allowed) return { error: LEASE_GATE_BLOCKED_MESSAGE }

  const f = parseLeaseFormData(formData)

  // 21E §1: refuse a live-create lease missing its start date or rent SERVER-SIDE (a blank rent parses to NaN and
  // silently dropped to NULL before). A lease without rent/date is not a partial record — it's a non-lease.
  try {
    mandatoryGate("lease", { start_date: f.startDate, rent_amount_cents: f.rentCents }, { relax: false })
  } catch (e) {
    if (e instanceof MissingMandatoryFieldsError) return { error: `Please add the lease's ${e.missing.join(", ")}.` }
    throw e
  }

  // Fail-safe: never create a lease that overlaps the unit's current in-force lease (must start end+1).
  const overlap = await findLeaseOverlapBlock(db, orgId, f.unitId, f.startDate)
  if (overlap) return { error: overlap }

  const origin = await checkOriginatingApplication(db, orgId, (formData.get("application_id") as string) || null, { tenantId: f.tenantId, unitId: f.unitId }, userId)
  if ("error" in origin) return { error: origin.error }

  // Inserts and, from an application, claims it before any child row (one lease per application).
  const created = await insertLeaseClaimingApplication(db, orgId, {
      unit_id: f.unitId,
      property_id: f.propertyId,
      tenant_id: f.tenantId,
      lease_type: f.leaseType,
      tenant_is_juristic: f.tenantIsJuristic,
      cpa_applies: f.cpaApplies,
      is_franchise_agreement: f.isFranchiseAgreement,
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
      deposit_account_id: (formData.get("deposit_account_id") as string) || null,
      trust_account_id:   (formData.get("trust_account_id") as string) || null,
      deposit_interest_to: f.depositInterestTo,
      special_terms: f.specialTerms,
      // ADDENDUM_69A: the wizard no longer writes a flat rate — it resolves via deposit_interest_config
      // (per the selected deposit account). Stays null unless set as a manual-override fallback.
      deposit_interest_rate_percent: f.depositInterestRatePercent,
      arrears_interest_enabled: f.arrearsInterestEnabled,
      arrears_interest_margin_percent: f.arrearsInterestMarginPercent,
      template_type: f.leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      template_source: "pleks",
      status: "draft",
      created_by: userId,
    }, origin.applicationId, userId)
  if ("error" in created) return { error: created.error }
  const lease = { id: created.leaseId }

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
  }).eq("id", f.unitId).eq("org_id", orgId) // org-scope guard (caller-ID census)

  await recordAudit(db, { orgId: orgId, table: "leases", recordId: lease.id, action: "INSERT", actorId: userId, after: { tenant_id: f.tenantId, unit_id: f.unitId, lease_type: f.leaseType, rent_cents: f.rentCents, originating_application_id: origin.applicationId } })

  revalidatePath("/leases")
  redirect(`/leases/${lease.id}`)
}

export async function createUploadedLease(formData: FormData): Promise<{ error: string } | { leaseId: string; documentError?: string }> {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw

  // Hard gate: an agency org can't create leases until its trust/deposit banking is configured.
  const gate = await getLeaseCreationGate(db, orgId)
  if (!gate.allowed) return { error: LEASE_GATE_BLOCKED_MESSAGE }

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

  // 21E §1: refuse a live-create lease missing start date or rent server-side (blank rent → NaN, was NULL-dropped).
  try {
    mandatoryGate("lease", { start_date: startDate, rent_amount_cents: rentCents }, { relax: false })
  } catch (e) {
    if (e instanceof MissingMandatoryFieldsError) return { error: `Please add the lease's ${e.missing.join(", ")}.` }
    throw e
  }

  // Fail-safe: never create a lease that overlaps the unit's current in-force lease (must start end+1).
  const uploadOverlap = await findLeaseOverlapBlock(db, orgId, unitId, startDate)
  if (uploadOverlap) return { error: uploadOverlap }

  const origin = await checkOriginatingApplication(db, orgId, (formData.get("application_id") as string) || null, { tenantId, unitId }, userId)
  if ("error" in origin) return { error: origin.error }

  // setFullYear/getFullYear are LOCAL-time accessors and the result was sliced in UTC — mixed coordinates.
  const escalationReviewDate = addCalendarMonths(startDate, 12)

  // CPA s14(2)(b)(ii) expiry-notice date is NOT stamped here — derived at evaluation time by the
  // lease-expiry-check cron (lib/leases/cpaRenewal). `auto_renewal_notice_due` is being dropped (70K §6).

  // Inserts and, from an application, claims it before any child row (one lease per application).
  const created = await insertLeaseClaimingApplication(db, orgId, {
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
      escalation_review_date: escalationReviewDate,
      deposit_amount_cents: depositCents,
      deposit_account_id: (formData.get("deposit_account_id") as string) || null,
      trust_account_id:   (formData.get("trust_account_id") as string) || null,
      deposit_interest_to: leaseType === "residential" ? "tenant" : "landlord",
      template_source: "uploaded",
      template_type: leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      status: "draft",
      created_by: userId,
    }, origin.applicationId, userId)
  if ("error" in created) return { error: created.error }
  const leaseId = created.leaseId

  // Insert co-tenants (co-lessees + company signatories; is_signatory marks which ones sign)
  const co = parseCoTenants(formData.get("co_tenants_json") as string | null)
  if (co.length > 0) {
    await db.from("lease_co_tenants").insert(
      co.map((c) => ({ org_id: orgId, lease_id: leaseId, tenant_id: c.tenant_id, is_signatory: c.is_signatory }))
    )
    await db.from("units").update({
      prospective_tenant_id: tenantId,
      prospective_co_tenant_ids: co.map((c) => c.tenant_id),
    }).eq("id", unitId).eq("org_id", orgId) // org-scope guard (caller-ID census)
  } else {
    await db.from("units").update({ prospective_tenant_id: tenantId }).eq("id", unitId).eq("org_id", orgId)
  }

  // Upload the signed PDF if provided. Same bucket and key family as the upload-document route, because
  // download-document signs `external_document_path` against `documents`. This wrote to `lease-documents` under a
  // `lease-documents/…` key until 2026-10-03, so even with both buckets present the download signed the wrong bucket;
  // and it swallowed every failure. The lease row already exists here, so a failed upload is reported, not fatal —
  // the agent can re-upload from the lease page (Path B/C).
  let documentError: string | undefined
  const file = formData.get("document")
  if (file instanceof File && file.size > 0) {
    const path = `orgs/${orgId}/leases/${leaseId}/signed_original.pdf`
    const { error: uploadError } = await db.storage
      .from("documents")
      .upload(path, await file.arrayBuffer(), { contentType: "application/pdf", upsert: true })
    if (uploadError) {
      console.error("createUploadedLease: document upload failed for lease", leaseId, uploadError.message)
      documentError = "The lease was created, but the PDF did not upload. Upload it again from the lease page."
    } else {
      const { error: pathError } = await db.from("leases").update({ external_document_path: path })
        .eq("id", leaseId).eq("org_id", orgId)
      if (pathError) {
        console.error("createUploadedLease: external_document_path write failed for lease", leaseId, pathError.message)
        documentError = "The lease was created, but the PDF was not linked. Upload it again from the lease page."
      }
    }
  }

  await recordAudit(db, { orgId: orgId, table: "leases", recordId: leaseId, action: "INSERT", actorId: userId, after: { tenant_id: tenantId, unit_id: unitId, lease_type: leaseType, rent_cents: rentCents, template_source: "uploaded", originating_application_id: origin.applicationId } })

  revalidatePath("/leases")
  return documentError ? { leaseId, documentError } : { leaseId }
}

export async function markAsSigned(leaseId: string, options: { depositReceived?: boolean } = {}) {
  const { activateLeaseCascade } = await import("@/lib/leases/activateLeaseCascade")
  const { checkLeasePrerequisites } = await import("@/lib/leases/checkPrerequisites")
  const { canActivateLease } = await import("@/lib/tier/canActivateLease")
  const { determineCpaApplicability } = await import("@/lib/leases/cpaApplicability")

  const gw = await requireAgentWriteAccess("activate_lease")
  const { db, userId, orgId } = gw

  // Tier gate (BUILD_60): Owner tier = 1 active lease, Steward = 20, Firm = ∞.
  const tierCheck = await canActivateLease(orgId)
  if (!tierCheck.ok) {
    return { error: tierCheck.reason ?? "You've reached your active lease limit. Upgrade to activate more." }
  }

  const prereqs = await checkLeasePrerequisites(db, leaseId, orgId)
  if (!prereqs.canProceed) {
    return { error: `${prereqs.failCount} prerequisite(s) not met` }
  }

  // CPA gate (ADDENDUM_04A): derive and snapshot CPA applicability at signing time.
  const { data: lease, error: leaseErr } = await db
    .from("leases")
    .select("status, tenant_id, is_franchise_agreement")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  if (leaseErr || !lease) return { error: "Lease not found" }
  // The UI offers this only on a draft; the action said nothing, and the cascade's claim accepts any non-active
  // status — so a direct call on a cancelled or expired lease re-ran the whole activation.
  if (lease.status !== "draft" && lease.status !== "pending_signing") return { error: "Only a draft or sent lease can be activated" }

  // leases.tenant_id is a tenants.id; the CPA facts live on the tenant's contact. This read went to contacts by
  // the tenant id until 2026-10-09 — two different uuids, so every manual activation stopped here.
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("contact_id")
    .eq("id", lease.tenant_id)
    .eq("org_id", orgId)
    .single()
  if (tenantErr || !tenant) return { error: "Tenant not found" }

  const { data: contact, error: contactErr } = await db
    .from("contacts")
    .select("entity_type, juristic_type, turnover_under_2m, asset_value_under_2m, size_bands_captured_at")
    .eq("id", tenant.contact_id)
    .eq("org_id", orgId)
    .single()
  if (contactErr || !contact) return { error: "Tenant contact not found" }

  const cpaDetermination = determineCpaApplicability({
    tenant: {
      entityType: (contact.entity_type as string | null),
      juristicType: (contact.juristic_type as string | null),
      turnoverUnder2m: (contact.turnover_under_2m as boolean | null),
      assetValueUnder2m: (contact.asset_value_under_2m as boolean | null),
      sizeBandsCapturedAt: (contact.size_bands_captured_at as string | null),
    },
    lease: { isFranchiseAgreement: (lease.is_franchise_agreement as boolean) ?? false },
  })

  if (!cpaDetermination.canActivate) {
    return { error: "CPA status is indeterminate. Confirm the tenant's annual turnover and asset value before activating." }
  }

  const { error: cpaUpdateErr } = await db
    .from("leases")
    .update({
      cpa_applies_at_signing: cpaDetermination.applies,
      cpa_determination_category: cpaDetermination.category,
      cpa_determination_notes: cpaDetermination.notes,
      cpa_determined_at: new Date().toISOString(),
    })
    .eq("id", leaseId)
    .eq("org_id", orgId)
  if (cpaUpdateErr) return { error: cpaUpdateErr.message }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "leases", recordId: leaseId,
    after: {
      action: "cpa_determination_snapshot",
      cpa_applies_at_signing: cpaDetermination.applies,
      cpa_determination_category: cpaDetermination.category,
    },
  })

  try {
    const result = await activateLeaseCascade(db, leaseId, orgId, "manual", userId, { depositReceived: options.depositReceived === true })
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath("/leases")
    return { success: true, steps: result.steps }
  } catch (e) {
    return { error: String(e) }
  }
}

const DEPOSIT_RECORDABLE_STATUSES = new Set(["active", "month_to_month", "notice"])

/** The agent's "deposit received" tick for a lease activated without it (or by DocuSeal, where nobody could tick).
 *  Gated on the leases capability, not finance: the tick belongs to whoever activates the lease, and letting agents
 *  hold leases but not finance. */
export async function recordLeaseDepositReceived(leaseId: string) {
  const { recordDepositReceived, sendDepositReceived, depositTimerEvent } = await import("@/lib/leases/leaseDepositReceipt")
  const { getOrgCapabilities } = await import("@/lib/org/capabilities")

  const gw = await requireAgentWriteAccess("activate_lease")
  const { db, userId, orgId } = gw
  if (!(await hasCapability(gw, "leases"))) return { error: "You don't have access to leases" }

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("status, deposit_amount_cents, tenant_id, property_id, unit_id, start_date")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  if (leaseError || !lease) return { error: "Lease not found" }
  if (!DEPOSIT_RECORDABLE_STATUSES.has(lease.status as string)) return { error: "Record the deposit when you activate the lease" }
  if (!lease.deposit_amount_cents || lease.deposit_amount_cents <= 0) return { error: "This lease has no deposit amount" }

  // Check-then-write: a second click between the read and the RPC could post twice. The button disables while the
  // call runs; a database guard needs a column no spec names yet.
  const { data: existing, error: existingError } = await db
    .from("deposit_transactions")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .eq("transaction_type", "deposit_received")
    .limit(1)
  if (existingError) return { error: "Could not check the deposit ledger" }
  if (existing && existing.length > 0) return { error: "The deposit is already recorded" }

  const recorded = await recordDepositReceived(db, lease, leaseId, orgId, userId)
  if (recorded.status !== "success") return { error: recorded.detail ?? "The deposit was not recorded" }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "leases", recordId: leaseId,
    after: { action: "deposit_received", deposit_amount_cents: lease.deposit_amount_cents },
  })
  const { error: eventError } = await db.from("lease_lifecycle_events").insert(depositTimerEvent(leaseId, orgId))
  if (eventError) console.error("recordLeaseDepositReceived: lifecycle event not written", eventError.message)

  const { data: org, error: orgError } = await db.from("organisations").select("type, name").eq("id", orgId).single()
  logQueryError("recordLeaseDepositReceived organisations", orgError)
  await sendDepositReceived(db, lease, leaseId, orgId, getOrgCapabilities((org?.type as OrgType) ?? "agency", (org?.name as string) ?? ""))

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

export async function sendForSigning(leaseId: string) {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw

  // Org-scope guard (caller-ID census): a foreign leaseId matches no row → "Lease not found".
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("status, generated_doc_path, template_source, tenant_id, rent_amount_cents, start_date, unit_id")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
    logQueryError("sendForSigning leases", leaseError)

  if (!lease) return { error: "Lease not found" }
  if (lease.status !== "draft") return { error: "Lease has already been sent for signing" }
  // A Pleks-rendered document on a lease whose source Pleks does not render is a stray (generate-docx refused
  // nothing before 2026-10-09): sending it would put our template in front of the signer, not the agency's lease.
  if (!rendersLeaseDocument(lease.template_source)) return { error: "This lease uses your own document — upload the signed copy instead" }
  if (!lease.generated_doc_path) return { error: "Generate the lease document first" }

  const sentForSigningAt = new Date().toISOString()
  await db.from("leases").update({ status: "pending_signing", sent_for_signing_at: sentForSigningAt }).eq("id", leaseId).eq("org_id", orgId)
  // draft → pending_signing is the point the lease leaves the agent's control and goes to a signer.
  // Its counterpart revert (lib/leases/revertSigning.ts) now audits too, so the round trip is a pair
  // of rows rather than a state that changes twice and is recorded once.
  await recordAudit(db, { orgId: orgId, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId, before: { status: "draft" }, after: { status: "pending_signing", sent_for_signing_at: sentForSigningAt, action: "lease_sent_for_signing" } })

  // event_type 'lease_sent_for_signing' was previously rejected by the CHECK constraint (silent-fail, D1);
  // the constraint now allows it. Surface any future regression instead of swallowing it.
  const { error: lifecycleErr } = await db.from("lease_lifecycle_events").insert({
    org_id: orgId,
    lease_id: leaseId,
    event_type: "lease_sent_for_signing",
    description: "Lease sent for digital signing via DocuSeal",
    triggered_by: "agent",
    triggered_by_user: userId,
  })
  if (lifecycleErr) console.error("[sendForSigning] lifecycle event insert failed:", lifecycleErr.message)

  // L1 — send lease.created comm to tenant
  if (lease.tenant_id) {
    try {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        db.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
        db.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
        fetchOrgSettings(orgId),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
      if (tenant?.email) {
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const propertyLabel = formatPropertyLabel(unit)
        const rentDisplay = formatZAR(lease.rent_amount_cents as number, true)
        const leaseStartDisplay = fmtDateLongZA(lease.start_date as string)
        await routeAndSend({
          orgId,
          tenantId: lease.tenant_id as string,
          templateKey: "lease.created",
          to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
          subject: `Your lease is ready to sign — ${propertyLabel}`,
          emailElement: React.createElement(LeaseCreatedEmail, {
            branding: buildBranding(orgSettings),
            tenantName,
            propertyLabel,
            rentDisplay,
            leaseStartDate: leaseStartDisplay,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "lease",
          entityId: leaseId,
          triggeredBy: userId,
          triggerEventType: "lease_state",
          triggerEventId: leaseId,
          toneVariant: "n/a",
        })
      }
    } catch {
      // Comm failure is non-fatal
    }
  }

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

/**
 * @knipignore The only lease-termination-notice implementation in the tree; issueDemandToVacate is the BREACH
 * instrument, a different thing. Carries SAST calendar arithmetic written to fix a real
 * off-by-one. Refused DEAD verdict, docs/DEAD-CODE-QUEUE.md.
 */
export async function giveNotice(leaseId: string, givenBy: "tenant" | "landlord", reason?: string) {
  const gw = await requireAgentWriteAccess("terminate_lease")
  const { db, userId, orgId } = gw

  // Org-scope guard (caller-ID census): a foreign leaseId matches nothing → "Lease not found", so a
  // caller can't put another org's lease on notice (+ email their tenant). lease.unit_id is then trusted.
  const { data: lease, error: leaseError } = await db.from("leases").select("*").eq("id", leaseId).eq("org_id", orgId).single()
    logQueryError("giveNotice leases", leaseError)
  if (!lease) return { error: "Lease not found" }

  // Both are LEGAL dates — Rule 6 of the Demand-to-Vacate guards reads them. Previously `new Date()`
  // sliced in UTC (an agent giving notice at 00:30 SAST recorded YESTERDAY) and the period end was
  // computed with local setDate/getDate and then sliced in UTC, so the tenant's notice period could end
  // a day early. Both now resolve in SAST and use pure calendar arithmetic.
  const noticeGivenDate = saTodayISO()
  const noticePeriodEnd = addCalendarDays(noticeGivenDate, lease.notice_period_days || 20)

  await db.from("leases").update({
    status: "notice",
    notice_given_by: givenBy,
    notice_given_date: noticeGivenDate,
    notice_period_end: noticePeriodEnd,
  }).eq("id", leaseId).eq("org_id", orgId)

  await db.from("units").update({ status: "notice" }).eq("id", lease.unit_id).eq("org_id", orgId)

  await db.from("unit_status_history").insert({
    unit_id: lease.unit_id,
    org_id: lease.org_id,
    from_status: "occupied",
    to_status: "notice",
    changed_by: userId,
    reason: reason ? `Notice given by ${givenBy}: ${reason}` : `Notice given by ${givenBy}`,
  })

  await recordAudit(db, { orgId: lease.org_id, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId, after: { status: "notice", notice_given_by: givenBy, notice_given_date: noticeGivenDate } })

  // L10 — send notice acknowledgement comm to tenant (only when tenant gives notice)
  if (givenBy === "tenant" && lease.tenant_id) {
    try {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        db.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id as string).single(),
        db.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id as string).single(),
        fetchOrgSettings(lease.org_id as string),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
      if (tenant?.email) {
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const propertyLabel = formatPropertyLabel(unit)
        const noticeDateDisplay = fmtDateLongZA(noticeGivenDate)
        const vacateDateDisplay = fmtDateLongZA(noticePeriodEnd)
        await routeAndSend({
          orgId: lease.org_id as string,
          tenantId: lease.tenant_id as string,
          templateKey: "lease.notice_acknowledged",
          to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
          subject: `Notice received — ${propertyLabel}`,
          emailElement: React.createElement(LeaseNoticeAcknowledgedEmail, {
            branding: buildBranding(orgSettings),
            tenantName,
            propertyLabel,
            noticeDate: noticeDateDisplay,
            vacateDate: vacateDateDisplay,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "lease",
          entityId: leaseId,
          triggeredBy: userId,
          triggerEventType: "lease_state",
          triggerEventId: leaseId,
          toneVariant: "n/a",
        })
      }
    } catch {
      // Comm failure is non-fatal
    }
  }

  revalidatePath(`/leases/${leaseId}`)
  revalidatePath("/leases")
  return { success: true }
}

/**
 * Promote an existing contact to a tenant role (for adding a company signatory as a co-lessee). Reuses the
 * contact's tenant row if one already exists (25A globality: one person → one contact, gains a tenant role),
 * else creates it. Returns the tenant id to store in lease_co_tenants. ADDENDUM_LEASE_CREATION_MODAL.
 */
export async function ensureTenantForContact(contactId: string): Promise<{ ok: boolean; tenantId?: string; error?: string }> {
  const gw = await requireAgentWriteAccess("ensure_tenant_for_contact")
  const { db, orgId } = gw

  const { data: contact, error: contactErr } = await db
    .from("contacts").select("id").eq("id", contactId).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (contactErr) return { ok: false, error: contactErr.message }
  if (!contact) return { ok: false, error: "Contact not found" }

  const { data: existing, error: existErr } = await db
    .from("tenants").select("id").eq("org_id", orgId).eq("contact_id", contactId).is("deleted_at", null).maybeSingle()
  if (existErr) return { ok: false, error: existErr.message }
  if (existing?.id) return { ok: true, tenantId: existing.id }

  const { data: created, error: createErr } = await db
    .from("tenants").insert({ org_id: orgId, contact_id: contactId }).select("id").single()
  if (createErr || !created) return { ok: false, error: createErr?.message ?? "Failed to create tenant" }
  return { ok: true, tenantId: created.id }
}

/**
 * The lease wizard closed without creating: release MY "currently creating" marker on the application so a
 * colleague is not warned off for the rest of the hold window. Someone else's marker is left alone.
 * Intentionally gateway(), not requireAgentWriteAccess: clearing my own presence marker creates no value, and it
 * must succeed wherever the page could take the marker — a lockdown throw here left a locked org's marker standing
 * for the whole hold window (walker F3).
 */
export async function releaseLeaseStart(applicationId: string): Promise<void> {
  const gw = await gateway()
  if (!gw) return
  await releaseLeaseStartMarker(gw.db, gw.orgId, applicationId, gw.userId)
}

const EDITABLE_TERMS_SELECT = "status, unit_id, start_date, end_date, is_fixed_term, rent_amount_cents, deposit_amount_cents, payment_due_day, escalation_percent, escalation_type, escalation_review_date, notice_period_days, generated_doc_path, docuseal_document_url, incomplete_mandatory"

/**
 * Edit a DRAFT lease's terms (/leases/[id]/edit — the target of the activation prerequisites' "Edit lease" links).
 * Only a draft: a lease sent for signing is out of the agent's hands, and an in-force one changes by amendment.
 * A Pleks-generated document no longer matches edited terms, so it is cleared and must be generated again before
 * signing (sendForSigning refuses without one) — sending the old file would put superseded terms before the signer.
 * Filling the start date and rent clears an import's incomplete_mandatory flag (21E corollary 12).
 * escalation_review_date moves only with the start date — it is a stored term an import may have stated.
 */
export async function updateDraftLeaseTerms(
  leaseId: string,
  input: LeaseTermsInput,
): Promise<{ error: string } | { success: true; documentCleared: boolean }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  // edit_lease is unmapped in ACTION_CAPABILITY ("gated at their call sites"), so the call site gates it.
  if (!(await hasCapability(gw, "leases"))) return { error: "Leases access is required" }
  const { db, userId, orgId } = gw
  const parsed = parseLeaseTermsEdit(input)
  if ("error" in parsed) return parsed

  // Org-scope guard (caller-ID census): a foreign leaseId matches no row → "Lease not found".
  const { data: lease, error: leaseError } = await db
    .from("leases").select(EDITABLE_TERMS_SELECT).eq("id", leaseId).eq("org_id", orgId).maybeSingle()
  logQueryError("updateDraftLeaseTerms leases", leaseError)
  if (!lease) return { error: "Lease not found" }
  if (lease.status !== "draft") return { error: "Only a draft lease can be edited. Change a signed lease by amendment." }

  const changed = changedTerms(lease, parsed.patch)
  if (changed.length === 0) return { success: true, documentCleared: false }
  if (changed.includes("start_date")) {
    const overlap = await findLeaseOverlapBlock(db, orgId, lease.unit_id as string | null, parsed.patch.start_date)
    if (overlap) return { error: overlap }
  }

  // A stored non-fixed type (an import) may stay; changing TO one would sign a document stating a fixed rate.
  if (changed.includes("escalation_type") && !SELECTABLE_ESCALATION_TYPES.some((t) => t.value === parsed.patch.escalation_type)) {
    return { error: "Only fixed escalation can be chosen until the lease document states CPI or prime-linked terms." }
  }
  const startMoved = changed.includes("start_date")
  const documentCleared = lease.generated_doc_path != null || lease.docuseal_document_url != null
  // Both document fields are cleared on EVERY change, not only when the read saw one: a generate-docx landing
  // between this read and the write would otherwise survive under the new terms.
  const update = {
    ...parsed.patch,
    ...(startMoved ? { escalation_review_date: addCalendarMonths(parsed.patch.start_date, 12) } : {}),
    ...recomputeIncompleteMandatory("lease", lease, { ...parsed.patch }),
    generated_doc_path: null,
    docuseal_document_url: null,
  }
  // .eq status draft: a concurrent send-for-signing between the read and this write must not be overwritten.
  const { data: updated, error: updateError } = await db
    .from("leases").update(update).eq("id", leaseId).eq("org_id", orgId).eq("status", "draft").select("id")
  logQueryError("updateDraftLeaseTerms update", updateError)
  if (updateError) return { error: "The lease could not be saved. Try again." }
  if (!updated?.length) return { error: "This lease is no longer a draft (it may have been sent for signing). Reload the page." }

  const audited: string[] = [
    ...changed, "incomplete_mandatory", "generated_doc_path", "docuseal_document_url",
    ...(startMoved ? ["escalation_review_date"] : []),
  ]
  const pick = (row: Record<string, unknown>) => Object.fromEntries(audited.map((k) => [k, row[k] ?? null]))
  await recordAudit(db, {
    orgId, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId,
    before: pick(lease), after: { ...pick(update), action: "lease_terms_edited" },
  })
  revalidatePath(`/leases/${leaseId}`)
  revalidatePath("/leases")
  return { success: true, documentCleared }
}

/**
 * Delete a DRAFT lease (only). Drafts have no payments/reconciliations yet, so this clears the child
 * rows (co-tenants, charges, clause selections), undoes the unit's draft-tenant reflection if it still
 * points at this draft, then removes the lease. Hard-guarded to status='draft' — an in-force lease is
 * never deletable here (it must be cancelled/ended through its own flow).
 */

export async function deleteLease(leaseId: string): Promise<{ error: string } | { success: true }> {
  const gw = await requireAgentWriteAccess("delete_lease")
  const { db, orgId } = gw

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("id, org_id, status, unit_id, tenant_id")
    .eq("id", leaseId)
    // Bound at the QUERY, not only by the compare below (M-061). The `lease.org_id !== orgId` test
    // is kept: it is now redundant, and redundant is the right state for an ownership check.
    .eq("org_id", orgId)
    .single()
  logQueryError("deleteLease leases", leaseError)
  if (!lease || lease.org_id !== orgId) return { error: "Lease not found" }
  if (lease.status !== "draft") return { error: "Only draft leases can be deleted" }

  const { error: ctErr } = await db.from("lease_co_tenants").delete().eq("lease_id", leaseId).eq("org_id", orgId)
  logQueryError("deleteLease lease_co_tenants", ctErr)
  const { error: chErr } = await db.from("lease_charges").delete().eq("lease_id", leaseId).eq("org_id", orgId)
  logQueryError("deleteLease lease_charges", chErr)
  const { error: clErr } = await db.from("lease_clause_selections").delete().eq("lease_id", leaseId).eq("org_id", orgId)
  logQueryError("deleteLease lease_clause_selections", clErr)

  // Undo the unit's draft-tenant reflection ONLY if it still points at this draft's tenant
  // (another draft for the same unit may own it — the .eq guard leaves that one intact).
  if (lease.unit_id) {
    const { error: unitErr } = await db
      .from("units")
      .update({ prospective_tenant_id: null, prospective_co_tenant_ids: [] })
      .eq("id", lease.unit_id).eq("org_id", orgId).eq("prospective_tenant_id", lease.tenant_id)
    logQueryError("deleteLease units reflection", unitErr)
  }

  const { error: delErr } = await db.from("leases").delete().eq("id", leaseId).eq("org_id", orgId).eq("status", "draft")
  if (delErr) return { error: delErr.message }

  await recordAudit(db, {
    orgId, actorId: gw.userId, action: "DELETE", table: "leases", recordId: leaseId,
    after: { action: "draft_deleted", unit_id: lease.unit_id },
  })

  revalidatePath("/leases")
  return { success: true }
}
