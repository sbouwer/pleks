"use server"

/**
 * lib/import/tenantImport.ts — bulk-create tenant contacts + thin tenant rows from a CSV (TPN-aware)
 *
 * Auth:   internal — called only by the admin-gated /api/import route, which passes the authenticated
 *         orgId + agentId. Service client for the privileged bulk writes.
 * Data:   contacts/tenants inserts + a dedup read, all org-scoped by the caller-supplied orgId; audit_log.
 *         Not a client-callable action (no client component imports this lib).
 */
import { createServiceClient } from "@/lib/supabase/server"
import { parseCSV, detectTpnFormat, type ImportResult } from "./csvParser"
import { convertTpnExport } from "./tpnParser"
import { validateTenantRow } from "./validators"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { idNumberColumns } from "@/lib/crypto/idNumber"

export async function importTenants(
  csvText: string,
  orgId: string,
  agentId: string
): Promise<ImportResult> {
  const supabase = await createServiceClient()
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

    // Deduplication: check by email in contacts
    const { data: existing, error: existingError } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .ilike("primary_email", row.email)
      .is("deleted_at", null)
      .limit(1)
    logQueryError("importTenants contacts", existingError)

    if (existing && existing.length > 0) {
      results.errors.push({
        row: index + 2,
        field: "email",
        message: `Contact with email "${row.email}" already exists — skipped`,
        severity: "warning",
      })
      results.skipped++
      continue
    }

    // Create contact first
    const { data: contact, error: contactError } = await supabase.from("contacts").insert({
      org_id: orgId,
      entity_type: "individual",
      primary_role: "tenant",
      first_name: row.first_name,
      last_name: row.last_name,
      primary_email: row.email,
      primary_phone: row.phone ?? null,
      id_type: row.id_type ?? "sa_id",
      ...idNumberColumns(row.id_number), // encrypted at rest + lookup hash (was raw, no hash)
      created_by: agentId,
    }).select("id").single()
    logQueryError("importTenants contacts", contactError)

    if (!contact) continue

    // Create thin tenant record
    await supabase.from("tenants").insert({
      org_id: orgId,
      contact_id: contact.id,
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
