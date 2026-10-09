/**
 * lib/leases/leaseDepositReceipt.ts — post a lease's deposit to the trust ledger and tell the tenant, once an agent says it arrived
 *
 * Auth:   Server-only; callers gate (activateLeaseCascade via markAsSigned, recordLeaseDepositReceived)
 * Data:   record_deposit_atomic (deposit_transactions + trust_transactions), tenant_view, units, lease_lifecycle_events
 * Notes:  The deposit reaches the trust ledger only when an agent ticks it received (Stéan, 2026-10-09). Activation
 *         used to post it unconditionally, which wrote a receipt into a regulated trust account for money nobody
 *         had seen. Kept out of activateLeaseCascade.ts so that file exports nothing but its entry point — the
 *         credential-mint census slices it by exported function.
 */
import * as React from "react"
import { SupabaseClient } from "@supabase/supabase-js"
import type { OrgCapabilities } from "@/lib/org/capabilities"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { DepositReceivedEmail } from "@/lib/comms/templates/tenant/deposits/deposit-received"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA } from "@/lib/dates"
import { formatZAR } from "@/lib/constants"

export interface DepositStep {
  step: string
  status: "success" | "failed" | "skipped"
  detail?: string
}

type DepositLease = { deposit_amount_cents: number | null; tenant_id: string; property_id: string; unit_id: string; start_date: string }

export async function recordDepositReceived(
  supabase: SupabaseClient,
  lease: DepositLease,
  leaseId: string,
  orgId: string,
  userId: string | undefined,
): Promise<DepositStep> {
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
  return { step: "Record deposit", status: "success", detail: formatZAR(lease.deposit_amount_cents, true) }
}

export function depositTimerEvent(leaseId: string, orgId: string) {
  return { org_id: orgId, lease_id: leaseId, event_type: "deposit_timer_started", description: "Deposit recorded", triggered_by: "system" }
}

export async function sendDepositReceived(
  supabase: SupabaseClient,
  lease: DepositLease,
  leaseId: string,
  orgId: string,
  capabilities: OrgCapabilities,
): Promise<DepositStep> {
  if (!lease.deposit_amount_cents || lease.deposit_amount_cents <= 0) {
    return { step: "Send deposit.received comm", status: "skipped", detail: "No deposit" }
  }
  try {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenant_view")
      .select("first_name, last_name, email, phone")
      .eq("id", lease.tenant_id)
      .eq("org_id", orgId)
      .single()
    logQueryError("sendDepositReceived tenant_view", tenantError)

    if (!tenant?.email) {
      return { step: "Send deposit.received comm", status: "skipped", detail: "No tenant email" }
    }

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("unit_number, properties(address_line1, suburb, city)")
      .eq("id", lease.unit_id)
      .eq("org_id", orgId)
      .maybeSingle()
    logQueryError("sendDepositReceived units", unitError)

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
    const depositDisplay = formatZAR(lease.deposit_amount_cents, true)
    const leaseStartDisplay = fmtDateLongZA(lease.start_date)

    // routeAndSend reports a failed send as { success: false } and never throws.
    const sent = await routeAndSend({
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
    if (!sent.success) return { step: "Send deposit.received comm", status: "failed", detail: sent.error ?? "Not sent" }

    return { step: "Send deposit.received comm", status: "success" }
  } catch (e) {
    return { step: "Send deposit.received comm", status: "failed", detail: String(e) }
  }
}
