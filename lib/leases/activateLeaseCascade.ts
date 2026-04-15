import { SupabaseClient } from "@supabase/supabase-js"
import { seedInspectionRooms } from "@/lib/inspections/seedRooms"

export interface CascadeStep {
  step: string
  status: "success" | "failed" | "skipped"
  detail?: string
}

export interface ActivationResult {
  leaseId: string
  status: "active"
  steps: CascadeStep[]
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
  try {
    await supabase.from("deposit_transactions").insert({
      org_id: orgId, lease_id: leaseId, tenant_id: lease.tenant_id,
      transaction_type: "deposit_received", direction: "credit",
      amount_cents: lease.deposit_amount_cents,
      description: "Security deposit received", created_by: userId ?? null,
    })
    await supabase.from("trust_transactions").insert({
      org_id: orgId, property_id: lease.property_id, unit_id: lease.unit_id,
      lease_id: leaseId, transaction_type: "deposit_received", direction: "credit",
      amount_cents: lease.deposit_amount_cents,
      description: "Security deposit", created_by: userId ?? null,
    })
    return { step: "Record deposit", status: "success", detail: `R ${(lease.deposit_amount_cents / 100).toFixed(2)}` }
  } catch (e) {
    return { step: "Record deposit", status: "failed", detail: String(e) }
  }
}

async function stepGenerateFirstInvoice(
  supabase: SupabaseClient,
  lease: { start_date: string; rent_amount_cents: number; tenant_id: string; unit_id: string; property_id: string },
  leaseId: string,
  orgId: string,
): Promise<CascadeStep> {
  try {
    const startDate = new Date(lease.start_date)
    const now = new Date()
    const invoiceMonth = new Date(Math.max(startDate.getTime(), now.getTime()))
    const daysInMonth = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0).getDate()
    const startDay = startDate.getDate()
    const isProRata = startDay > 1
    const ratio = isProRata ? (daysInMonth - startDay + 1) / daysInMonth : 1
    const proRataRent = Math.round(lease.rent_amount_cents * ratio)

    const { data: charges } = await supabase
      .from("lease_charges").select("amount_cents, description")
      .eq("lease_id", leaseId).eq("is_active", true)

    const chargesTotal = (charges ?? []).reduce((sum: number, c: { amount_cents: number }) => sum + c.amount_cents, 0)
    const proRataCharges = Math.round(chargesTotal * ratio)
    const total = proRataRent + proRataCharges
    const periodEnd = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0).toISOString().split("T")[0]

    await supabase.from("rent_invoices").insert({
      org_id: orgId, lease_id: leaseId, unit_id: lease.unit_id, tenant_id: lease.tenant_id,
      invoice_number: `PLEKS-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
      invoice_date: now.toISOString().split("T")[0],
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
): Promise<CascadeStep> {
  try {
    const { data: existing } = await supabase
      .from("inspections").select("id").eq("lease_id", leaseId).eq("inspection_type", "move_in").limit(1)

    if (existing?.length) return { step: "Move-in inspection", status: "skipped", detail: "Already scheduled" }

    const leaseType = lease.lease_type ?? "residential"
    const { data: newInspection, error: inspErr } = await supabase
      .from("inspections")
      .insert({
        org_id: orgId, unit_id: lease.unit_id, property_id: lease.property_id,
        lease_id: leaseId, tenant_id: lease.tenant_id,
        inspection_type: "move_in", lease_type: leaseType,
        scheduled_date: lease.start_date, status: "scheduled",
      })
      .select("id").single()

    if (inspErr || !newInspection) throw new Error(inspErr?.message ?? "Insert failed")
    await seedInspectionRooms(supabase, newInspection.id, orgId, leaseType)
    return { step: "Schedule move-in inspection", status: "success", detail: `Scheduled for ${lease.start_date}` }
  } catch (e) {
    return { step: "Schedule move-in inspection", status: "failed", detail: String(e) }
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
  const { data: lease } = await supabase
    .from("leases")
    .select("*, units(unit_number, properties(id, name))")
    .eq("id", leaseId)
    .single()

  if (!lease) throw new Error("Lease not found")

  const { data: coTenants } = await supabase
    .from("lease_co_tenants").select("tenant_id").eq("lease_id", leaseId)

  // Step 1: Activate lease — must succeed (throws on failure)
  await supabase.from("leases").update({ status: "active", signed_at: new Date().toISOString() }).eq("id", leaseId)

  const steps: CascadeStep[] = [
    { step: "Activate lease", status: "success" },
    await stepUpdateUnit(supabase, lease, orgId, userId, triggeredBy),
    await stepCreateTenancy(supabase, lease, leaseId, orgId, coTenants ?? []),
    await stepRecordDeposit(supabase, lease, leaseId, orgId, userId),
    await stepGenerateFirstInvoice(supabase, lease, leaseId, orgId),
    await stepScheduleMoveIn(supabase, lease, leaseId, orgId),
    { step: "DebiCheck mandate", status: "skipped", detail: "Organisation does not use DebiCheck" },
    await stepLogLifecycleEvents(supabase, leaseId, orgId, triggeredBy, userId),
    await stepAuditLog(supabase, leaseId, orgId, triggeredBy, userId),
  ]

  return { leaseId, status: "active", steps }
}
