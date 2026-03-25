"use server"

import { createClient } from "@/lib/supabase/server"
import { parseCSV, detectTpnFormat, type ImportResult } from "./csvParser"
import { convertTpnExport } from "./tpnParser"
import { validateTenantRow } from "./validators"

export async function importTenants(
  csvText: string,
  orgId: string,
  agentId: string
): Promise<ImportResult> {
  const supabase = await createClient()
  let rows = parseCSV(csvText)

  const firstLine = csvText.split("\n")[0] ?? ""
  const headers = firstLine.split(",").map((h) => h.trim().toLowerCase())
  if (detectTpnFormat(headers)) {
    rows = convertTpnExport(rows)
  }

  const results: ImportResult = { created: 0, skipped: 0, errors: [] }

  for (const [index, row] of rows.entries()) {
    const errors = validateTenantRow(row, index)
    const blockingErrors = errors.filter((e) => e.severity !== "warning")

    if (blockingErrors.length > 0) {
      results.errors.push(...errors)
      results.skipped++
      continue
    }

    results.errors.push(...errors.filter((e) => e.severity === "warning"))

    // Deduplication: check by email
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", row.email)
      .is("deleted_at", null)
      .limit(1)

    if (existing && existing.length > 0) {
      results.errors.push({
        row: index + 2,
        field: "email",
        message: `Tenant with email "${row.email}" already exists — skipped`,
        severity: "warning",
      })
      results.skipped++
      continue
    }

    await supabase.from("tenants").insert({
      org_id: orgId,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone ?? null,
      id_type: row.id_type ?? "sa_id",
      id_number: row.id_number ?? null,
      employer_name: row.employer_name ?? null,
      employment_type: row.employment_type ?? null,
      popia_consent_given: false,
      created_by: agentId,
    })

    results.created++
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenants",
    record_id: orgId,
    action: "INSERT",
    changed_by: agentId,
    new_values: { action: "csv_import_tenants", created: results.created, skipped: results.skipped },
  })

  return results
}
