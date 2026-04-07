import { SupabaseClient } from "@supabase/supabase-js"

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

export async function activateLeaseCascade(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string,
  triggeredBy: "docuseal" | "manual",
  userId?: string
): Promise<ActivationResult> {
  const steps: CascadeStep[] = []

  function push(step: string, status: CascadeStep["status"], detail?: string) {
    steps.push({ step, status, detail })
  }

  // Fetch lease data — throw if not found
  const { data: lease } = await supabase
    .from("leases")
    .select("*, units(unit_number, properties(id, name))")
    .eq("id", leaseId)
    .single()

  if (!lease) throw new Error("Lease not found")

  const { data: coTenants } = await supabase
    .from("lease_co_tenants")
    .select("tenant_id")
    .eq("lease_id", leaseId)

  // Step 1: Update lease status — MUST succeed
  await supabase
    .from("leases")
    .update({
      status: "active",
      signed_at: new Date().toISOString(),
    })
    .eq("id", leaseId)
  push("Activate lease", "success")

  // Step 2: Update unit → occupied
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
    push("Update unit status", "success")
  } catch (e) {
    push("Update unit status", "failed", String(e))
  }

  // Step 3: Create tenancy history (primary tenant + co-tenants)
  try {
    await supabase.from("tenancy_history").insert({
      org_id: orgId,
      tenant_id: lease.tenant_id,
      unit_id: lease.unit_id,
      lease_id: leaseId,
      move_in_date: lease.start_date,
      status: "active",
    })
    for (const ct of coTenants ?? []) {
      await supabase.from("tenancy_history").insert({
        org_id: orgId,
        tenant_id: ct.tenant_id,
        unit_id: lease.unit_id,
        lease_id: leaseId,
        move_in_date: lease.start_date,
        status: "active",
      })
    }
    push("Create tenancy records", "success", `${1 + (coTenants?.length ?? 0)} tenant(s)`)
  } catch (e) {
    push("Create tenancy records", "failed", String(e))
  }

  // Step 4: Record deposit (skip if deposit_amount_cents is null/0)
  try {
    if (lease.deposit_amount_cents && lease.deposit_amount_cents > 0) {
      await supabase.from("deposit_transactions").insert({
        org_id: orgId,
        lease_id: leaseId,
        tenant_id: lease.tenant_id,
        transaction_type: "deposit_received",
        direction: "credit",
        amount_cents: lease.deposit_amount_cents,
        description: `Security deposit received`,
        created_by: userId ?? null,
      })
      await supabase.from("trust_transactions").insert({
        org_id: orgId,
        property_id: lease.property_id,
        unit_id: lease.unit_id,
        lease_id: leaseId,
        transaction_type: "deposit_received",
        direction: "credit",
        amount_cents: lease.deposit_amount_cents,
        description: `Security deposit`,
        created_by: userId ?? null,
      })
      push("Record deposit", "success", `R ${(lease.deposit_amount_cents / 100).toFixed(2)}`)
    } else {
      push("Record deposit", "skipped", "No deposit amount set")
    }
  } catch (e) {
    push("Record deposit", "failed", String(e))
  }

  // Step 5: Generate first month's invoice
  try {
    const startDate = new Date(lease.start_date)
    const now = new Date()
    const invoiceMonth = startDate > now ? startDate : now
    const daysInMonth = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0).getDate()
    const startDay = startDate.getDate()
    const isProRata = startDay > 1
    const ratio = isProRata ? (daysInMonth - startDay + 1) / daysInMonth : 1
    const proRataRent = Math.round(lease.rent_amount_cents * ratio)

    const { data: charges } = await supabase
      .from("lease_charges")
      .select("amount_cents, description")
      .eq("lease_id", leaseId)
      .eq("is_active", true)

    const chargesTotal = (charges ?? []).reduce((sum: number, c: { amount_cents: number }) => sum + c.amount_cents, 0)
    const proRataCharges = Math.round(chargesTotal * ratio)
    const total = proRataRent + proRataCharges

    const periodEnd = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0]

    await supabase.from("rent_invoices").insert({
      org_id: orgId,
      lease_id: leaseId,
      unit_id: lease.unit_id,
      tenant_id: lease.tenant_id,
      invoice_number: `PLEKS-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
      invoice_date: now.toISOString().split("T")[0],
      due_date: lease.start_date,
      period_from: lease.start_date,
      period_to: periodEnd,
      rent_amount_cents: proRataRent,
      other_charges_cents: proRataCharges,
      total_amount_cents: total,
      balance_cents: total,
      status: "open",
      charges_breakdown: (charges ?? []).map((c: { description: string; amount_cents: number }) => ({
        description: c.description,
        amount_cents: Math.round(c.amount_cents * ratio),
      })),
      notes: isProRata ? `Pro-rata from ${lease.start_date}` : null,
    })
    push(
      "Generate first invoice",
      "success",
      `R ${(total / 100).toFixed(2)}${isProRata ? " (pro-rata)" : ""}`
    )
  } catch (e) {
    push("Generate first invoice", "failed", String(e))
  }

  // Step 6: Schedule move-in inspection (only if none exists)
  try {
    const { data: existing } = await supabase
      .from("inspections")
      .select("id")
      .eq("lease_id", leaseId)
      .eq("inspection_type", "move_in")
      .limit(1)

    if (existing?.length) {
      push("Move-in inspection", "skipped", "Already scheduled")
    } else {
      await supabase.from("inspections").insert({
        org_id: orgId,
        unit_id: lease.unit_id,
        property_id: lease.property_id,
        lease_id: leaseId,
        tenant_id: lease.tenant_id,
        inspection_type: "move_in",
        lease_type: lease.lease_type ?? "residential",
        scheduled_date: lease.start_date,
        status: "scheduled",
      })
      push("Schedule move-in inspection", "success", `Scheduled for ${lease.start_date}`)
    }
  } catch (e) {
    push("Schedule move-in inspection", "failed", String(e))
  }

  // Step 7: DebiCheck — always skip (no peach_merchant_id on org in current schema)
  push("DebiCheck mandate", "skipped", "Organisation does not use DebiCheck")

  // Step 8: Log lifecycle events
  try {
    await supabase.from("lease_lifecycle_events").insert([
      {
        org_id: orgId,
        lease_id: leaseId,
        event_type: "lease_signed",
        description: `Lease ${triggeredBy === "docuseal" ? "signed via DocuSeal" : "signed manually"}`,
        triggered_by: triggeredBy === "docuseal" ? "system" : "agent",
        triggered_by_user: userId ?? null,
      },
      {
        org_id: orgId,
        lease_id: leaseId,
        event_type: "deposit_timer_started",
        description: `Deposit recorded`,
        triggered_by: "system",
      },
    ])
    push("Log lifecycle events", "success")
  } catch (e) {
    push("Log lifecycle events", "failed", String(e))
  }

  // Step 9: Audit log
  try {
    await supabase.from("audit_log").insert({
      org_id: orgId,
      table_name: "leases",
      record_id: leaseId,
      action: "UPDATE",
      changed_by: userId ?? null,
      new_values: {
        status: "active",
        signed_at: new Date().toISOString(),
        activation_trigger: triggeredBy,
      },
    })
    push("Audit log", "success")
  } catch (e) {
    push("Audit log", "failed", String(e))
  }

  return { leaseId, status: "active", steps }
}
