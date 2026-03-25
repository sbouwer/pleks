"use server"

import { createClient } from "@/lib/supabase/server"
import { parseCSV, detectTpnFormat, type ImportResult } from "./csvParser"
import { convertTpnExport } from "./tpnParser"
import { validatePropertyRow } from "./validators"

export async function importProperties(
  csvText: string,
  orgId: string,
  agentId: string
): Promise<ImportResult> {
  const supabase = await createClient()
  let rows = parseCSV(csvText)

  // Auto-detect TPN format
  const firstLine = csvText.split("\n")[0] ?? ""
  const headers = firstLine.split(",").map((h) => h.trim().toLowerCase())
  if (detectTpnFormat(headers)) {
    rows = convertTpnExport(rows)
  }

  const results: ImportResult = { created: 0, skipped: 0, errors: [] }

  for (const [index, row] of rows.entries()) {
    const errors = validatePropertyRow(row, index)
    const blockingErrors = errors.filter((e) => e.severity !== "warning")

    if (blockingErrors.length > 0) {
      results.errors.push(...errors)
      results.skipped++
      continue
    }

    // Add warnings (non-blocking)
    results.errors.push(...errors.filter((e) => e.severity === "warning"))

    // Deduplication: check by address + suburb
    const { data: existing } = await supabase
      .from("properties")
      .select("id")
      .eq("org_id", orgId)
      .ilike("address_line1", row.address_line1)
      .ilike("suburb", row.suburb ?? "")
      .is("deleted_at", null)
      .limit(1)

    if (existing && existing.length > 0) {
      results.errors.push({
        row: index + 2,
        field: "address_line1",
        message: `Property at "${row.address_line1}" already exists — skipped`,
        severity: "warning",
      })
      results.skipped++
      continue
    }

    // Create property
    const { data: property } = await supabase
      .from("properties")
      .insert({
        org_id: orgId,
        name: row.property_name,
        address_line1: row.address_line1,
        suburb: row.suburb ?? "",
        city: row.city,
        province: row.province ?? "",
        postal_code: row.postal_code ?? "",
        erf_number: row.erf_number ?? null,
        type: row.property_type ?? "residential",
      })
      .select("id")
      .single()

    if (!property) {
      results.errors.push({ row: index + 2, field: "property_name", message: "Failed to create property" })
      results.skipped++
      continue
    }

    // Create unit
    await supabase.from("units").insert({
      org_id: orgId,
      property_id: property.id,
      unit_number: row.unit_number,
      bedrooms: row.bedrooms ? parseInt(row.bedrooms) : null,
      bathrooms: row.bathrooms ? parseInt(row.bathrooms) : null,
      floor_area_m2: row.floor_area_m2 ? parseFloat(row.floor_area_m2) : null,
      asking_rent_cents: row.asking_rent_cents ? parseInt(row.asking_rent_cents) : null,
      status: "vacant",
    })

    // Auto-create default building
    await supabase.from("buildings").insert({
      org_id: orgId,
      property_id: property.id,
      name: row.property_name,
      is_primary: true,
      is_visible_in_ui: false,
    })

    results.created++
  }

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: orgId,
    action: "INSERT",
    changed_by: agentId,
    new_values: { action: "csv_import_properties", created: results.created, skipped: results.skipped },
  })

  return results
}
