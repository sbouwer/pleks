/**
 * lib/leases/activateLeaseCascade.ts — Orchestrate all side-effects when a lease activates
 *
 * Auth:   Server-only; called from DocuSeal webhook and manual activation actions
 * Data:   leases, units, organisations, tenancy_history, deposits, invoices via service client
 * Notes:  Each step returns a CascadeStep so failures are recorded without aborting the whole
 *         cascade. Supabase returns `{ error }` rather than throwing, so every write checks it — a step's
 *         try/catch alone reported a refused insert as "success" (2026-10-09). Fetches OrgCapabilities so BUILD_63 email step can use org-type-correct
 *         sender framing (signatureAttribution, tenantWelcomeSender) without an extra DB round-trip.
 *         BUILD_63 Phase 3: stepSendDepositReceived fires deposit.received comm after deposit record.
 */
import * as React from "react"
import { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { seedInspectionRooms } from "@/lib/inspections/seedRooms"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { resolveOrgTone } from "@/lib/comms/resolveOrgTone"
import { depositTimerEvent, recordDepositReceived, sendDepositReceived } from "@/lib/leases/leaseDepositReceipt"
import { generatePortalInviteLink } from "@/lib/leases/portalInviteLink"
import { LeaseActivatedEmail } from "@/lib/comms/templates/tenant/leases/lease-activated"
import { LeaseSignedEmail } from "@/lib/comms/templates/tenant/leases/lease-signed"
import { PortalTenantInviteEmail } from "@/lib/comms/templates/tenant/portal/tenant-invite"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA, monthEnd, saDateISO } from "@/lib/dates"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { formatZAR } from "@/lib/constants"
import { recordAudit } from "@/lib/audit/recordAudit"

export interface CascadeStep {
  step: string
  status: "success" | "failed" | "skipped"
  detail?: string
}

export interface ActivationResult {
  leaseId: string
  status: "active"
  steps: CascadeStep[]
  capabilities: OrgCapabilities
}

// ── Step helpers ──────────────────────────────────────────────────────────────
// Each returns a CascadeStep so the main function stays a flat sequence of awaits.

async function stepUpdateUnit(
  supabase: SupabaseClient,
  lease: { unit_id: string },
  orgId: string,
  userId: string | undefined,
  triggeredBy: string,
): Promise<CascadeStep> {
  try {
    const { error: unitError } = await supabase.from("units").update({
      status: "occupied",
      prospective_tenant_id: null,
      prospective_co_tenant_ids: [],
    }).eq("id", lease.unit_id).eq("org_id", orgId)
    if (unitError) return { step: "Update unit status", status: "failed", detail: unitError.message }
    const { error: historyError } = await supabase.from("unit_status_history").insert({
      unit_id: lease.unit_id,
      org_id: orgId,
      from_status: "vacant",
      to_status: "occupied",
      changed_by: userId ?? null,
      reason: `Lease activated (${triggeredBy})`,
    })
    if (historyError) return { step: "Update unit status", status: "failed", detail: `Unit occupied; history not written: ${historyError.message}` }
    return { step: "Update unit status", status: "success" }
  } catch (e) {
    return { step: "Update unit status", status: "failed", detail: String(e) }
  }
}

async function stepCreateTenancy(
  supabase: SupabaseClient,
  lease: { tenant_id: string; unit_id: string; start_date: string },
  leaseId: string,
  orgId: string,
  coTenants: { tenant_id: string }[],
): Promise<CascadeStep> {
  try {
    const rows = [
      { org_id: orgId, tenant_id: lease.tenant_id, unit_id: lease.unit_id, lease_id: leaseId, move_in_date: lease.start_date, status: "active" },
      ...coTenants.map((ct) => ({ org_id: orgId, tenant_id: ct.tenant_id, unit_id: lease.unit_id, lease_id: leaseId, move_in_date: lease.start_date, status: "active" })),
    ]
    const { error } = await supabase.from("tenancy_history").insert(rows)
    if (error) return { step: "Create tenancy records", status: "failed", detail: error.message }
    return { step: "Create tenancy records", status: "success", detail: `${rows.length} tenant(s)` }
  } catch (e) {
    return { step: "Create tenancy records", status: "failed", detail: String(e) }
  }
}

async function stepGenerateFirstInvoice(
  supabase: SupabaseClient,
  lease: { start_date: string; rent_amount_cents: number; tenant_id: string; unit_id: string; property_id: string },
  leaseId: string,
  orgId: string,
): Promise<CascadeStep> {
  try {
    // All calendar dates. `getDate()`/`getFullYear()` are LOCAL-time accessors and were being read off
    // UTC-midnight carriers, so the day number — and therefore the pro-rata ratio — depended on the
    // server's timezone. Same comparison, same ratio, no coordinates crossed.
    const now = new Date()
    const startDateIso = lease.start_date
    const todayIso = saDateISO(now)
    const invoiceMonthIso = startDateIso > todayIso ? startDateIso : todayIso
    const daysInMonth = Number(monthEnd(invoiceMonthIso).slice(8, 10))
    const startDay = Number(startDateIso.slice(8, 10))
    const isProRata = startDay > 1
    const ratio = isProRata ? (daysInMonth - startDay + 1) / daysInMonth : 1
    const proRataRent = Math.round(lease.rent_amount_cents * ratio)

    const { data: charges, error: chargesError } = await supabase
      .from("lease_charges").select("amount_cents, description")
      .eq("lease_id", leaseId).eq("is_active", true)
    logQueryError("stepGenerateFirstInvoice lease_charges", chargesError)

    const chargesTotal = (charges ?? []).reduce((sum: number, c: { amount_cents: number }) => sum + c.amount_cents, 0)
    const proRataCharges = Math.round(chargesTotal * ratio)
    const total = proRataRent + proRataCharges
    // `new Date(y, m+1, 0)` is LOCAL midnight of the month's last day; slicing it in UTC returned the
    // PREVIOUS day for any timezone east of Greenwich — a first invoice one day short, every time.
    const periodEnd = monthEnd(invoiceMonthIso)

    const { error: invoiceError } = await supabase.from("rent_invoices").insert({
      org_id: orgId, lease_id: leaseId, unit_id: lease.unit_id, tenant_id: lease.tenant_id,
      invoice_number: `PLEKS-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
      invoice_date: saDateISO(now),
      due_date: lease.start_date, period_from: lease.start_date, period_to: periodEnd,
      rent_amount_cents: proRataRent, other_charges_cents: proRataCharges,
      total_amount_cents: total, balance_cents: total, status: "open",
      charges_breakdown: (charges ?? []).map((c: { description: string; amount_cents: number }) => ({
        description: c.description, amount_cents: Math.round(c.amount_cents * ratio),
      })),
      notes: isProRata ? `Pro-rata from ${lease.start_date}` : null,
    })
    if (invoiceError) return { step: "Generate first invoice", status: "failed", detail: invoiceError.message }
    return { step: "Generate first invoice", status: "success", detail: `R ${(total / 100).toFixed(2)}${isProRata ? " (pro-rata)" : ""}` }
  } catch (e) {
    return { step: "Generate first invoice", status: "failed", detail: String(e) }
  }
}

async function stepScheduleMoveIn(
  supabase: SupabaseClient,
  lease: { unit_id: string; property_id: string; tenant_id: string; start_date: string; lease_type: string | null },
  leaseId: string,
  orgId: string,
  userId: string | undefined,
): Promise<CascadeStep> {
  try {
    const { data: existing, error: existingError } = await supabase
      .from("inspections").select("id").eq("lease_id", leaseId).eq("inspection_type", "move_in").limit(1)
    logQueryError("stepScheduleMoveIn inspections", existingError)

    if (existing?.length) return { step: "Move-in inspection", status: "skipped", detail: "Already scheduled" }

    const leaseType = lease.lease_type ?? "residential"
    const { data: newInspection, error: inspErr } = await supabase
      .from("inspections")
      .insert({
        org_id: orgId, unit_id: lease.unit_id, property_id: lease.property_id,
        lease_id: leaseId, tenant_id: lease.tenant_id,
        inspection_type: "move_in", lease_type: leaseType,
        scheduled_date: lease.start_date, status: "scheduled",
        // Default-on-create = the activating agent (ADDENDUM_TEAMS D-12); null → Everyone/Org.
        assigned_user_id: userId ?? null,
        assigned_at: new Date().toISOString(),
      })
      .select("id").single()

    if (inspErr || !newInspection) throw new Error(inspErr?.message ?? "Insert failed")
    await seedInspectionRooms(supabase, newInspection.id, orgId, leaseType)
    return { step: "Schedule move-in inspection", status: "success", detail: `Scheduled for ${lease.start_date}` }
  } catch (e) {
    return { step: "Schedule move-in inspection", status: "failed", detail: String(e) }
  }
}

async function stepSendLeaseSigned(
  supabase: SupabaseClient,
  lease: { tenant_id: string; unit_id: string },
  leaseId: string,
  orgId: string,
  capabilities: OrgCapabilities,
): Promise<CascadeStep> {
  try {
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      supabase.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
      supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
      fetchOrgSettings(orgId),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
    if (!tenant?.email) return { step: "Send lease.signed comm (L3)", status: "skipped", detail: "No tenant email" }

    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = formatPropertyLabel(unit)

    const sent = await routeAndSend({
      orgId,
      tenantId: lease.tenant_id,
      templateKey: "lease.signed",
      to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
      subject: `Lease signed — ${propertyLabel}`,
      emailElement: React.createElement(LeaseSignedEmail, {
        branding: buildBranding(orgSettings),
        tenantName,
        propertyLabel,
        senderName: capabilities.copy.tenantWelcomeSender,
        signatureAttribution: capabilities.copy.signatureAttribution,
      }),
      entityType: "lease",
      entityId: leaseId,
      triggerEventType: "lease_activation",
      triggerEventId: leaseId,
      toneVariant: "n/a",
    })
    if (!sent.success) return { step: "Send lease.signed comm (L3)", status: "failed", detail: sent.error ?? "Not sent" }
    return { step: "Send lease.signed comm (L3)", status: "success" }
  } catch (e) {
    return { step: "Send lease.signed comm (L3)", status: "failed", detail: String(e) }
  }
}

async function stepSendLeaseActivated(
  supabase: SupabaseClient,
  lease: {
    tenant_id: string; rent_amount_cents: number; start_date: string
    end_date: string | null; is_fixed_term: boolean; unit_id: string
  },
  leaseId: string,
  orgId: string,
  capabilities: OrgCapabilities,
): Promise<CascadeStep> {
  try {
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      supabase.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
      supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
      fetchOrgSettings(orgId),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
    if (!tenant?.email) return { step: "Send lease.activated comm", status: "skipped", detail: "No tenant email" }

    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = formatPropertyLabel(unit)
    const rentDisplay = formatZAR(lease.rent_amount_cents, true)
    const fmt = (d: string) => fmtDateLongZA(d)

    const sent = await routeAndSend({
      orgId,
      tenantId: lease.tenant_id,
      templateKey: "lease.activated",
      to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
      subject: `Your lease is now active — ${propertyLabel}`,
      emailElement: React.createElement(LeaseActivatedEmail, {
        branding: buildBranding(orgSettings),
        tenantName,
        propertyLabel,
        rentDisplay,
        leaseStartDate: fmt(lease.start_date),
        leaseEndDate: lease.end_date ? fmt(lease.end_date) : undefined,
        isFixedTerm: lease.is_fixed_term,
        portalUrl: absoluteUrl("/tenant"),
        senderName: capabilities.copy.tenantWelcomeSender,
        signatureAttribution: capabilities.copy.signatureAttribution,
      }),
      entityType: "lease",
      entityId: leaseId,
      triggerEventType: "lease_activation",
      triggerEventId: leaseId,
      toneVariant: "n/a",
    })
    if (!sent.success) return { step: "Send lease.activated comm", status: "failed", detail: sent.error ?? "Not sent" }
    return { step: "Send lease.activated comm", status: "success" }
  } catch (e) {
    return { step: "Send lease.activated comm", status: "failed", detail: String(e) }
  }
}

async function stepSendPortalInvite(
  supabase: SupabaseClient,
  lease: { tenant_id: string; unit_id: string },
  leaseId: string,
  orgId: string,
  capabilities: OrgCapabilities,
): Promise<CascadeStep> {
  try {
    // Check idempotency guard on tenants table (tenant_view doesn't expose portal_invite_sent_at)
    const { data: tenantRecord, error: tenantRecordError } = await supabase
      .from("tenants")
      .select("portal_invite_sent_at")
      .eq("id", lease.tenant_id)
      .single()
    logQueryError("stepSendPortalInvite tenants", tenantRecordError)

    if (tenantRecord?.portal_invite_sent_at) {
      return { step: "Portal auto-invite (P1)", status: "skipped", detail: "Already invited" }
    }

    const [tenantRes, unitRes, orgSettings, orgRow] = await Promise.all([
      supabase.from("tenant_view").select("first_name, last_name, company_name, email, phone").eq("id", lease.tenant_id).single(),
      supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
      fetchOrgSettings(orgId),
      supabase.from("organisations").select("settings").eq("id", orgId).single(),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null

    if (!tenant?.email) return { step: "Portal auto-invite (P1)", status: "skipped", detail: "No tenant email" }

    const tenantName = (tenant.company_name as string | null)
      || [tenant.first_name, tenant.last_name].filter(Boolean).join(" ")
      || "Tenant"
    const propertyLabel = formatPropertyLabel(unit)
    const toneVariant = resolveOrgTone(orgRow.data?.settings)

    // Generate a branded hand-off link rather than letting Supabase send its generic email. invite for a
    // net-new tenant; magic-link upgrade if the applicant already has a login (BUILD_69 P2 — `invite` errors
    // on an already-registered email, which used to fail this step silently).
    const service = await createServiceClient()
    // Adapter: normalise Supabase's generateLink response (data.properties can be null on error) to the
    // helper's narrower shape, so the routing logic stays cleanly unit-testable.
    const link = await generatePortalInviteLink(
      async (args) => {
        const r = await service.auth.admin.generateLink(args)
        const actionLink = r.data?.properties?.action_link
        return { data: actionLink ? { properties: { action_link: actionLink } } : null, error: r.error }
      },
      {
        email: tenant.email as string,
        data: { role: "tenant", tenant_id: lease.tenant_id, org_id: orgId, full_name: tenantName },
        redirectTo: absoluteUrl("/tenant"),
      },
    )
    if ("error" in link) return { step: "Portal auto-invite (P1)", status: "failed", detail: link.error }

    // Stamp only a send that went out: a stamp on a failed send makes every later run skip as "Already invited".
    const sent = await routeAndSend({
      orgId,
      tenantId: lease.tenant_id,
      templateKey: "portal.tenant_invite",
      to: { email: tenant.email as string, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
      subject: `Set up your tenant portal — ${propertyLabel}`,
      emailElement: React.createElement(PortalTenantInviteEmail, {
        branding: buildBranding(orgSettings),
        tenantName,
        portalUrl: link.actionLink,
        senderName: capabilities.copy.tenantWelcomeSender,
        signatureAttribution: capabilities.copy.signatureAttribution,
      }),
      entityType: "lease",
      entityId: leaseId,
      triggerEventType: "lease_activation",
      triggerEventId: leaseId,
      toneVariant,
    })
    if (!sent.success) return { step: "Portal auto-invite (P1)", status: "failed", detail: sent.error ?? "Not sent" }

    const { error: stampError } = await supabase
      .from("tenants")
      .update({ portal_invite_sent_at: new Date().toISOString() })
      .eq("id", lease.tenant_id)
      .eq("org_id", orgId)
    if (stampError) return { step: "Portal auto-invite (P1)", status: "failed", detail: `Invite sent; not stamped, so it may be sent again: ${stampError.message}` }

    return { step: "Portal auto-invite (P1)", status: "success" }
  } catch (e) {
    return { step: "Portal auto-invite (P1)", status: "failed", detail: String(e) }
  }
}

async function stepLogLifecycleEvents(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string,
  triggeredBy: "docuseal" | "manual",
  userId: string | undefined,
  depositRecorded: boolean,
): Promise<CascadeStep> {
  try {
    const { error } = await supabase.from("lease_lifecycle_events").insert([
      {
        org_id: orgId, lease_id: leaseId, event_type: "lease_signed",
        description: `Lease ${triggeredBy === "docuseal" ? "signed via DocuSeal" : "signed manually"}`,
        triggered_by: triggeredBy === "docuseal" ? "system" : "agent",
        triggered_by_user: userId ?? null,
      },
      ...(depositRecorded ? [depositTimerEvent(leaseId, orgId)] : []),
    ])
    if (error) return { step: "Log lifecycle events", status: "failed", detail: error.message }
    return { step: "Log lifecycle events", status: "success" }
  } catch (e) {
    return { step: "Log lifecycle events", status: "failed", detail: String(e) }
  }
}

async function stepAuditLog(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string,
  triggeredBy: "docuseal" | "manual",
  userId: string | undefined,
): Promise<CascadeStep> {
  try {
    await recordAudit(supabase, { orgId: orgId, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId ?? null, after: { status: "active", signed_at: new Date().toISOString(), activation_trigger: triggeredBy } })
    return { step: "Audit log", status: "success" }
  } catch (e) {
    return { step: "Audit log", status: "failed", detail: String(e) }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function activateLeaseCascade(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string,
  triggeredBy: "docuseal" | "manual",
  userId?: string,
  options: { depositReceived?: boolean } = {},
): Promise<ActivationResult> {
  const [{ data: lease }, { data: org }, { data: coTenants, error: coTenantsError }] = await Promise.all([
    supabase.from("leases").select("*, units(unit_number, properties(id, name))").eq("id", leaseId).eq("org_id", orgId).single(),
    supabase.from("organisations").select("type, name").eq("id", orgId).single(),
    supabase.from("lease_co_tenants").select("tenant_id").eq("lease_id", leaseId),
  ])

  if (!lease) throw new Error("Lease not found")
  // A failed read here would activate the lease with its co-tenants left off the tenancy records.
  if (coTenantsError) throw new Error(`Co-tenants could not be read: ${coTenantsError.message}`)

  const capabilities = getOrgCapabilities(
    ((org?.type as OrgType) ?? "agency"),
    ((org?.name as string) ?? ""),
  )

  // Tier gate (BUILD_60) enforced on EVERY activation path. markAsSigned pre-checks this, but the DocuSeal webhook
  // activation path did not — a signed lease could activate past the org's active-lease cap once e-signing goes
  // live. Guard on the NOT-yet-active case only, so an at-least-once webhook retry of an already-active lease still
  // reaches the idempotent no-op below instead of throwing on its own now-counted lease. (security 2026-07-07.)
  if ((lease.status as string) !== "active") {
    const { canActivateLease } = await import("@/lib/tier/canActivateLease")
    const tierCheck = await canActivateLease(orgId)
    if (!tierCheck.ok) {
      throw new Error(tierCheck.reason ?? "Active lease limit reached — upgrade to activate more.")
    }
  }

  // Step 1: Activate lease — ATOMIC idempotency claim. DocuSeal (and every webhook provider) delivers
  // at-least-once and retries on timeout, and markAsSigned can be double-clicked; without a guard a second run
  // would double deposit_received into the trust ledger + double the unit/cascade. The conditional UPDATE
  // (status <> 'active') means only the FIRST caller flips the lease — a duplicate matches 0 rows and we bail
  // BEFORE any ledger/unit/comm writes. Race-safe via Postgres row-locking: concurrent runs serialise on the
  // row, the loser re-evaluates the WHERE against the now-active row and updates nothing. (Ties to F-series trust
  // integrity — the deposit insert must never run twice.) Mint a STABLE per-lease payment reference too.
  const paymentReference = "PL" + leaseId.replace(/-/g, "").slice(0, 8).toUpperCase()
  const { data: claimed, error: claimErr } = await supabase
    .from("leases")
    .update({ status: "active", signed_at: new Date().toISOString(), payment_reference: paymentReference })
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .neq("status", "active")
    .select("id")
  if (claimErr) throw new Error(`Lease activation claim failed: ${claimErr.message}`)
  if (!claimed || claimed.length === 0) {
    // Already active — a prior delivery/click ran the cascade. Idempotent no-op; do NOT re-ledger.
    return {
      leaseId,
      status: "active",
      steps: [{ step: "Activate lease", status: "skipped", detail: "Already active — cascade skipped (idempotent)" }],
      capabilities,
    }
  }

  const hasDeposit = (lease.deposit_amount_cents ?? 0) > 0
  const depositStep: CascadeStep = options.depositReceived
    ? await recordDepositReceived(supabase, lease, leaseId, orgId, userId)
    : { step: "Record deposit", status: "skipped", detail: hasDeposit ? "Not received yet — record it on the Finance tab when it arrives" : "No deposit amount set" }
  const depositRecorded = depositStep.status === "success"

  const steps: CascadeStep[] = [
    { step: "Activate lease", status: "success" },
    await stepUpdateUnit(supabase, lease, orgId, userId, triggeredBy),
    await stepCreateTenancy(supabase, lease, leaseId, orgId, coTenants ?? []),
    depositStep,
    depositRecorded
      ? await sendDepositReceived(supabase, lease, leaseId, orgId, capabilities)
      : { step: "Send deposit.received comm", status: "skipped", detail: "Deposit not recorded" },
    await stepGenerateFirstInvoice(supabase, lease, leaseId, orgId),
    await stepScheduleMoveIn(supabase, lease, leaseId, orgId, userId),
    await stepLogLifecycleEvents(supabase, leaseId, orgId, triggeredBy, userId, depositRecorded),
    await stepAuditLog(supabase, leaseId, orgId, triggeredBy, userId),
    // BUILD_63 Phase 5: L3 + L4 + P1
    await stepSendLeaseSigned(supabase, lease, leaseId, orgId, capabilities),
    await stepSendLeaseActivated(supabase, lease, leaseId, orgId, capabilities),
    await stepSendPortalInvite(supabase, lease, leaseId, orgId, capabilities),
  ]

  return { leaseId, status: "active", steps, capabilities }
}
