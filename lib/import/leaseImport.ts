"use server"

import { createClient } from "@/lib/supabase/server"
import { parseCSV, type ImportResult } from "./csvParser"
import { validateLeaseRow } from "./validators"

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

    // Match tenant by email
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", row.tenant_email)
      .is("deleted_at", null)
      .limit(1)
      .single()

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
    // Parse: first part before comma = unit number
    const unitAddress = row.unit_address ?? ""
    const parts = unitAddress.split(",").map((p) => p.trim())
    const unitNum = parts[0] ?? ""
    const propertyAddr = parts.slice(1).join(", ").trim()

    let unitId: string | null = null
    let propertyId: string | null = null

    // Try exact unit_number match first
    if (unitNum) {
      const query = supabase
        .from("units")
        .select("id, property_id, properties(address_line1)")
        .eq("org_id", orgId)
        .ilike("unit_number", unitNum)
        .is("deleted_at", null)

      const { data: matchedUnits } = await query

      if (matchedUnits && matchedUnits.length === 1) {
        // Unique match
        unitId = matchedUnits[0].id
        propertyId = matchedUnits[0].property_id
      } else if (matchedUnits && matchedUnits.length > 1 && propertyAddr) {
        // Multiple units with same number — disambiguate by property address
        const match = matchedUnits.find((u) => {
          const prop = u.properties as unknown as { address_line1: string } | null
          return prop?.address_line1?.toLowerCase().includes(propertyAddr.toLowerCase().slice(0, 10))
        })
        if (match) {
          unitId = match.id
          propertyId = match.property_id
        }
      }
    }

    // Fallback: no match found
    if (!unitId) {
      // Try broader search by unit number only
      const { data: unitByNumber } = await supabase
        .from("units")
        .select("id, property_id")
        .eq("org_id", orgId)
        .ilike("unit_number", `%${unitNum}%`)
        .is("deleted_at", null)
        .limit(1)
        .single()

      if (unitByNumber) {
        unitId = unitByNumber.id
        propertyId = unitByNumber.property_id
      }
    }

    if (!unitId || !propertyId) {
      results.errors.push({
        row: index + 2,
        field: "unit_address",
        message: `Could not match unit "${unitAddress}" — import properties first`,
      })
      results.skipped++
      continue
    }

    // Create lease
    const rentCents = parseInt(row.monthly_rent_cents) || 0
    const depositCents = parseInt(row.deposit_held_cents) || 0
    const escalation = parseFloat(row.escalation_percent) || 10

    const { data: lease } = await supabase
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
        signed_at: new Date().toISOString(),
        created_by: agentId,
      })
      .select("id")
      .single()

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

    // Opening balances
    if (depositCents > 0) {
      await supabase.from("trust_transactions").insert({
        org_id: orgId,
        property_id: propertyId,
        unit_id: unitId,
        lease_id: lease.id,
        transaction_type: "deposit_received",
        direction: "credit",
        amount_cents: depositCents,
        description: `Opening balance — deposit migrated`,
        reference: `MIGRATION-${new Date().toISOString().slice(0, 10)}`,
        is_opening_balance: true,
        created_by: agentId,
      })

      // Also create deposit_transaction for the deposit engine
      await supabase.from("deposit_transactions").insert({
        org_id: orgId,
        lease_id: lease.id,
        tenant_id: tenant.id,
        transaction_type: "deposit_received",
        direction: "credit",
        amount_cents: depositCents,
        description: `Opening balance — deposit migrated`,
        created_by: agentId,
      })
    }

    // Opening arrears
    const arrearsCents = parseInt(row.current_arrears_cents) || 0
    if (arrearsCents > 0) {
      await supabase.from("arrears_cases").insert({
        org_id: orgId,
        lease_id: lease.id,
        tenant_id: tenant.id,
        unit_id: unitId,
        property_id: propertyId,
        lease_type: row.lease_type ?? "residential",
        total_arrears_cents: arrearsCents,
        oldest_outstanding_date: new Date().toISOString(),
        months_in_arrears: 1,
        status: "open",
        current_step: 0,
      })
    }

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
