"use server"

/**
 * lib/import/leaseImport.ts — CSV lease import: match tenant/unit, create leases + opening balances
 *
 * Auth:   server-only; org passed by the caller (the import route is agent-gated). Injectable core —
 *         receives the service client + orgId; not directly reachable as a form action.
 * Data:   leases, units, tenant_view, arrears_cases; deposit opening balance via record_deposit_atomic
 *         (deposit_transactions + trust posting, atomic, is_opening_balance).
 */
import { createClient } from "@/lib/supabase/server"
import { parseCSV, type ImportResult } from "./csvParser"
import { validateLeaseRow } from "./validators"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ── Helpers ────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>

type UnitRow = { id: string; property_id: string; properties: unknown }

async function resolveUnitByAddress(
  supabase: SupabaseClient,
  orgId: string,
  unitAddress: string,
): Promise<{ unitId: string; propertyId: string } | null> {
  const parts = unitAddress.split(",").map((p) => p.trim())
  const unitNum = parts[0] ?? ""
  const propertyAddr = parts.slice(1).join(", ").trim()

  if (unitNum) {
    const { data: matchedUnits, error: matchedUnitsError } = await supabase
      .from("units")
      .select("id, property_id, properties(address_line1)")
      .eq("org_id", orgId)
      .ilike("unit_number", unitNum)
      .is("deleted_at", null)
    logQueryError("resolveUnitByAddress units", matchedUnitsError)

    if (matchedUnits?.length === 1) {
      const u = matchedUnits[0] as UnitRow
      return { unitId: u.id, propertyId: u.property_id }
    }

    if (matchedUnits && matchedUnits.length > 1 && propertyAddr) {
      const match = (matchedUnits as UnitRow[]).find((u) => {
        const prop = u.properties as { address_line1: string } | null
        return prop?.address_line1?.toLowerCase().includes(propertyAddr.toLowerCase().slice(0, 10))
      })
      if (match) return { unitId: match.id, propertyId: match.property_id }
    }
  }

  // Fallback: broader search by unit number only
  const { data: unitByNumber, error: unitByNumberError } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("org_id", orgId)
    .ilike("unit_number", `%${unitNum}%`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()
    logQueryError("resolveUnitByAddress units", unitByNumberError)

  if (unitByNumber) {
    return { unitId: unitByNumber.id, propertyId: unitByNumber.property_id }
  }

  return null
}

async function createOpeningBalances(
  supabase: SupabaseClient,
  params: {
    orgId: string
    agentId: string
    propertyId: string
    unitId: string
    leaseId: string
    tenantId: string
    depositCents: number
    leaseType: string
    row: Record<string, string>
  },
): Promise<void> {
  const { orgId, agentId, propertyId, unitId, leaseId, tenantId, depositCents, leaseType, row } = params

  if (depositCents > 0) {
    // Atomic deposit sub-ledger + trust opening-balance posting (ADDENDUM_TRUST_RPC_ATOMICITY step 3 —
    // reuses step-2's record_deposit_atomic with its opening-balance + trust-reference params).
    const { error: depErr } = await supabase.rpc("record_deposit_atomic", {
      p_org_id: orgId,
      p_lease_id: leaseId,
      p_tenant_id: tenantId,
      p_amount_cents: depositCents,
      p_dep_txn_type: "deposit_received",
      p_dep_description: "Opening balance — deposit migrated",
      p_trust_txn_type: "deposit_received",
      p_trust_description: "Opening balance — deposit migrated",
      p_initiated_by: "agent",
      p_created_by: agentId,
      p_property_id: propertyId ?? null,
      p_unit_id: unitId ?? null,
      p_reference: null,
      p_effective_rate_percent: null,
      p_rate_config_id: null,
      p_statement_month: null,
      p_is_opening_balance: true,
      p_trust_reference: `MIGRATION-${new Date().toISOString().slice(0, 10)}`,
    })
    if (depErr) console.error("[leaseImport] record_deposit_atomic (migration) failed:", depErr.message)
  }

  const arrearsCents = Number.parseInt(row.current_arrears_cents) || 0
  if (arrearsCents > 0) {
    await supabase.from("arrears_cases").insert({
      org_id: orgId,
      lease_id: leaseId,
      tenant_id: tenantId,
      unit_id: unitId,
      property_id: propertyId,
      lease_type: leaseType,
      total_arrears_cents: arrearsCents,
      oldest_outstanding_date: new Date().toISOString(),
      months_in_arrears: 1,
      status: "open",
      current_step: 0,
    })
  }
}

// ── Main import function ───────────────────────────────────────────────

export async function importLeases(
  csvText: string,
  orgId: string,
  agentId: string
): Promise<ImportResult> {
  const supabase = await createClient()
  const rows = parseCSV(csvText)
  const results: ImportResult = { created: 0, skipped: 0, errors: [] }

  for (const [index, row] of rows.entries()) {
    const errors = validateLeaseRow(row, index)
    const blockingErrors = errors.filter((e) => e.severity !== "warning")

    if (blockingErrors.length > 0) {
      results.errors.push(...errors)
      results.skipped++
      continue
    }

    // Match tenant by email via tenant_view
    const { data: tenant, error: tenantError } = await supabase
      .from("tenant_view")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", row.tenant_email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
    logQueryError("importLeases tenant_view", tenantError)

    if (!tenant) {
      results.errors.push({
        row: index + 2,
        field: "tenant_email",
        message: `No tenant found with email "${row.tenant_email}" — import tenants first`,
      })
      results.skipped++
      continue
    }

    // Match unit by unit_address field ("Flat 1, 3 Salford Street")
    const unitAddress = row.unit_address ?? ""
    const unitMatch = await resolveUnitByAddress(supabase, orgId, unitAddress)

    if (!unitMatch) {
      results.errors.push({
        row: index + 2,
        field: "unit_address",
        message: `Could not match unit "${unitAddress}" — import properties first`,
      })
      results.skipped++
      continue
    }

    const { unitId, propertyId } = unitMatch

    // Create lease
    const rentCents = Number.parseInt(row.monthly_rent_cents) || 0
    const depositCents = Number.parseInt(row.deposit_held_cents) || 0
    const escalation = Number.parseFloat(row.escalation_percent) || 10

    const { data: lease, error: leaseError } = await supabase
      .from("leases")
      .insert({
        org_id: orgId,
        unit_id: unitId,
        property_id: propertyId,
        tenant_id: tenant.id,
        lease_type: row.lease_type ?? "residential",
        start_date: row.lease_start,
        end_date: row.lease_end || null,
        is_fixed_term: !!row.lease_end,
        rent_amount_cents: rentCents,
        deposit_amount_cents: depositCents || null,
        deposit_interest_to: row.lease_type === "commercial" ? "landlord" : "tenant",
        escalation_percent: escalation,
        escalation_type: "fixed",
        payment_due_day: 1,
        notice_period_days: 20,
        status: "active",
        migrated: true,
        signed_at: new Date().toISOString(),
        created_by: agentId,
      })
      .select("id")
      .single()
    logQueryError("importLeases leases", leaseError)

    if (!lease) {
      results.errors.push({ row: index + 2, field: "lease_start", message: "Failed to create lease" })
      results.skipped++
      continue
    }

    // Mark unit as occupied
    await supabase.from("units").update({ status: "occupied" }).eq("id", unitId)

    // Create tenancy history
    await supabase.from("tenancy_history").insert({
      org_id: orgId,
      tenant_id: tenant.id,
      unit_id: unitId,
      lease_id: lease.id,
      move_in_date: row.lease_start,
      status: "active",
    })

    // Opening balances and arrears
    await createOpeningBalances(supabase, {
      orgId,
      agentId,
      propertyId,
      unitId,
      leaseId: lease.id,
      tenantId: tenant.id,
      depositCents,
      leaseType: row.lease_type ?? "residential",
      row,
    })

    results.created++
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "leases",
    record_id: orgId,
    action: "INSERT",
    changed_by: agentId,
    new_values: { action: "csv_import_leases", created: results.created, skipped: results.skipped },
  })

  return results
}
