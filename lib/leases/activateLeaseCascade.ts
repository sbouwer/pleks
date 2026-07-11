/**
 * lib/leases/activateLeaseCascade.ts — Orchestrate all side-effects when a lease activates
 *
 * Auth:   Server-only; called from DocuSeal webhook and manual activation actions
 * Data:   leases, units, organisations, tenancy_history, deposits, invoices via service client
 * Notes:  Each step returns a CascadeStep so failures are recorded without aborting the whole
 *         cascade. Fetches OrgCapabilities so BUILD_63 email step can use org-type-correct
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
import { DepositReceivedEmail } from "@/lib/comms/templates/tenant/deposits/deposit-received"
import { generatePortalInviteLink } from "@/lib/leases/portalInviteLink"
import { LeaseActivatedEmail } from "@/lib/comms/templates/tenant/leases/lease-activated"
import { LeaseSignedEmail } from "@/lib/comms/templates/tenant/leases/lease-signed"
import { PortalTenantInviteEmail } from "@/lib/comms/templates/tenant/portal/tenant-invite"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA, monthEnd, saDateISO } from "@/lib/dates"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"

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
    await supabase.from("units").update({
      status: "occupied",
      prospective_tenant_id: null,
      prospective_co_tenant_ids: [],
    }).eq("id", lease.unit_id)
    await supabase.from("unit_status_history").insert({
      unit_id: lease.unit_id,
      org_id: orgId,
      from_status: "vacant",
      to_status: "occupied",
      changed_by: userId ?? null,
      reason: `Lease activated (${triggeredBy})`,
    })
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
    await supabase.from("tenancy_history").insert(rows)
    return { step: "Create tenancy records", status: "success", detail: `${rows.length} tenant(s)` }
  } catch (e) {
    return { step: "Create tenancy records", status: "failed", detail: String(e) }
  }
}

async function stepRecordDeposit(
  supabase: SupabaseClient,
  lease: { deposit_amount_cents: number | null; tenant_id: string; property_id: string; unit_id: string },
  leaseId: string,
  orgId: string,
  userId: string | undefined,
): Promise<CascadeStep> {
  if (!lease.deposit_amount_cents || lease.deposit_amount_cents <= 0) {
    return { step: "Record deposit", status: "skipped", detail: "No deposit amount set" }
  }
  // Atomic deposit sub-ledger + trust posting (ADDENDUM_TRUST_RPC_ATOMICITY step 2) — the two
  // ledgers commit together or not at all (previously written separately → could disagree).
  const { error } = await supabase.rpc("record_deposit_atomic", {
    p_org_id: orgId,
    p_lease_id: leaseId,
    p_tenant_id: lease.tenant_id,
    p_amount_cents: lease.deposit_amount_cents,
    p_dep_txn_type: "deposit_received",
    p_dep_description: "Security deposit received",
    p_trust_txn_type: "deposit_received",
    p_trust_description: "Security deposit",
    p_initiated_by: "agent",
    p_created_by: userId ?? null,
    p_property_id: lease.property_id ?? null,
    p_unit_id: lease.unit_id ?? null,
    p_reference: null,
    p_effective_rate_percent: null,
    p_rate_config_id: null,
    p_statement_month: null,
  })
  if (error) return { step: "Record deposit", status: "failed", detail: error.message }
  return { step: "Record deposit", status: "success", detail: `R ${(lease.deposit_amount_cents / 100).toFixed(2)}` }
}

async function stepSendDepositReceived(
  supabase: SupabaseClient,
  lease: { deposit_amount_cents: number | null; tenant_id: string; start_date: string; unit_id: string },
  leaseId: string,
  orgId: string,
  capabilities: OrgCapabilities,
): Promise<CascadeStep> {
  if (!lease.deposit_amount_cents || lease.deposit_amount_cents <= 0) {
    return { step: "Send deposit.received comm", status: "skipped", detail: "No deposit" }
  }
  try {
    // Fetch tenant contact
    const { data: tenant, error: tenantError } = await supabase
      .from("tenant_view")
      .select("first_name, last_name, email, phone")
      .eq("id", lease.tenant_id)
      .single()
    logQueryError("stepSendDepositReceived tenant_view", tenantError)

    if (!tenant?.email) {
      return { step: "Send deposit.received comm", status: "skipped", detail: "No tenant email" }
    }

    // Fetch property label for email body
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("unit_number, properties(address_line1, suburb, city)")
      .eq("id", lease.unit_id)
      .maybeSingle()
    logQueryError("stepSendDepositReceived units", unitError)

    type PropRow = { address_line1: string; suburb: string | null; city: string }
    const raw = unit as unknown as { unit_number: string; properties: PropRow | PropRow[] | null } | null
    const rawProps = raw?.properties ?? null
    const prop = Array.isArray(rawProps) ? rawProps[0] : rawProps
    const propertyLabel = prop
      ? [prop.address_line1, `Unit ${raw?.unit_number}`, prop.suburb ?? prop.city].filter(Boolean).join(", ")
      : "your property"

    const orgSettings = await fetchOrgSettings(orgId)
    const branding = buildBranding(orgSettings)
    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const depositDisplay = "R " + (lease.deposit_amount_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
    const leaseStartDisplay = fmtDateLongZA(lease.start_date)

    await routeAndSend({
      orgId,
      tenantId: lease.tenant_id,
      templateKey: "deposit.received",
      to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
      subject: `Deposit received — ${depositDisplay} — ${propertyLabel}`,
      emailElement: React.createElement(DepositReceivedEmail, {
        branding,
        tenantName,
        propertyLabel,
        depositAmountDisplay: depositDisplay,
        leaseStartDate: leaseStartDisplay,
        senderName: capabilities.copy.tenantWelcomeSender,
      }),
      entityType: "lease",
      entityId: leaseId,
      triggerEventType: "lease_activation",
      triggerEventId: leaseId,
      toneVariant: "n/a",
    })

    return { step: "Send deposit.received comm", status: "success" }
  } catch (e) {
    return { step: "Send deposit.received comm", status: "failed", detail: String(e) }
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

    await supabase.from("rent_invoices").insert({
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
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"

    await routeAndSend({
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
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    const rentDisplay = "R " + (lease.rent_amount_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
    const fmt = (d: string) => fmtDateLongZA(d)

    await routeAndSend({
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
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
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

    await routeAndSend({
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

    await supabase
      .from("tenants")
      .update({ portal_invite_sent_at: new Date().toISOString() })
      .eq("id", lease.tenant_id)

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
): Promise<CascadeStep> {
  try {
    await supabase.from("lease_lifecycle_events").insert([
      {
        org_id: orgId, lease_id: leaseId, event_type: "lease_signed",
        description: `Lease ${triggeredBy === "docuseal" ? "signed via DocuSeal" : "signed manually"}`,
        triggered_by: triggeredBy === "docuseal" ? "system" : "agent",
        triggered_by_user: userId ?? null,
      },
      {
        org_id: orgId, lease_id: leaseId, event_type: "deposit_timer_started",
        description: "Deposit recorded", triggered_by: "system",
      },
    ])
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
    await supabase.from("audit_log").insert({
      org_id: orgId, table_name: "leases", record_id: leaseId,
      action: "UPDATE", changed_by: userId ?? null,
      new_values: { status: "active", signed_at: new Date().toISOString(), activation_trigger: triggeredBy },
    })
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
  userId?: string
): Promise<ActivationResult> {
  const [{ data: lease }, { data: org }, { data: coTenants }] = await Promise.all([
    supabase.from("leases").select("*, units(unit_number, properties(id, name))").eq("id", leaseId).single(),
    supabase.from("organisations").select("type, name").eq("id", orgId).single(),
    supabase.from("lease_co_tenants").select("tenant_id").eq("lease_id", leaseId),
  ])

  if (!lease) throw new Error("Lease not found")

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

  const steps: CascadeStep[] = [
    { step: "Activate lease", status: "success" },
    await stepUpdateUnit(supabase, lease, orgId, userId, triggeredBy),
    await stepCreateTenancy(supabase, lease, leaseId, orgId, coTenants ?? []),
    await stepRecordDeposit(supabase, lease, leaseId, orgId, userId),
    await stepSendDepositReceived(supabase, lease, leaseId, orgId, capabilities),
    await stepGenerateFirstInvoice(supabase, lease, leaseId, orgId),
    await stepScheduleMoveIn(supabase, lease, leaseId, orgId, userId),
    await stepLogLifecycleEvents(supabase, leaseId, orgId, triggeredBy, userId),
    await stepAuditLog(supabase, leaseId, orgId, triggeredBy, userId),
    // BUILD_63 Phase 5: L3 + L4 + P1
    await stepSendLeaseSigned(supabase, lease, leaseId, orgId, capabilities),
    await stepSendLeaseActivated(supabase, lease, leaseId, orgId, capabilities),
    await stepSendPortalInvite(supabase, lease, leaseId, orgId, capabilities),
  ]

  return { leaseId, status: "active", steps, capabilities }
}
