import { createServiceClient } from "@/lib/supabase/server"
import { buildDocx } from "@/lib/leases/generateDocument"
import type { LeaseVariables, ResolvedClause } from "@/lib/leases/generateDocument"

// Placeholder values used in every sample document
function sampleVariables(leaseType: string): LeaseVariables {
  const today = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  return {
    lessor_name: "[Lessor / Agency Name]",
    lessor_reg_number: "XXXXXXXX",
    lessor_address: "123 Sample Street, Sample Suburb, Johannesburg",
    lessor_email: "lessor@example.com",
    lessor_contact: "011 000 0000",
    agent_name: "[Organisation Name]",
    agent_company: "[Agency Name]",
    lessee_name: "Sample Tenant",
    lessee_id_reg: "0000000000000",
    lessee_address: "456 Tenant Road, Sample Suburb, Johannesburg",
    lessee_email: "tenant@example.com",
    lessee_contact: "082 000 0000",
    lessee2_name: "",
    lessee2_id: "",
    property_address: "789 Property Avenue, Sample Suburb, Johannesburg",
    unit_number: "Unit 1",
    building_name: "Sample Building",
    erf_description: "Erf 1234, Sample Suburb",
    commencement_date: "1 January 2025",
    end_date: "31 December 2025",
    lease_period_months: "12",
    lease_period_words: "twelve",
    is_fixed_term: "yes",
    notice_period_days: "20",
    renewal_period: "2 months",
    monthly_rent_formatted: "R 10,000.00",
    deposit_formatted: "R 20,000.00",
    escalation_percent: "10",
    annual_escalation_formatted: "10% per annum",
    payment_due_day: "1st",
    rate_per_sqm: "",
    unit_size_sqm: "75",
    lease_type_description: leaseType,
    arrears_interest_margin: "2",
    arrears_interest_margin_words: "two",
    deposit_interest_rate: "5",
    lessor_bank_name: "Sample Bank",
    lessor_account_holder: "Sample Trust Account",
    lessor_account_number: "000 000 0000",
    lessor_branch_code: "000000",
    lessor_bank_details: "Sample Bank, Acc: 000 000 0000, Branch: 000000",
    signature_date: today,
    date_formatted: today,
    vat_rate: "15",
  }
}

export async function generateSampleLeaseDocument(
  orgId: string,
  leaseType: "residential" | "commercial"
): Promise<{ storagePath: string }> {
  const supabase = await createServiceClient()

  // Load clause library
  const { data: library } = await supabase
    .from("lease_clause_library")
    .select("*")
    .in("lease_type", [leaseType, "both"])
    .order("sort_order")

  // Load org-level defaults (toggle preferences)
  const { data: orgDefaults } = await supabase
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", orgId)

  const orgDefaultMap = new Map(orgDefaults?.map((d) => [d.clause_key, d.enabled]) ?? [])

  // Filter to enabled clauses using the same priority as the HTML preview
  const enabledClauses = (library ?? []).filter((clause) => {
    if (clause.is_required) return true
    return orgDefaultMap.get(clause.clause_key) ?? clause.is_enabled_by_default
  })

  // Assign sequential clause numbers
  const clauseSnapshot: Record<string, number> = {}
  enabledClauses.forEach((clause, i) => {
    clauseSnapshot[clause.clause_key] = i + 1
  })

  const variables = sampleVariables(leaseType)

  // Resolve tokens in each clause body (ref + var only; self resolved in buildDocx)
  const resolvedClauses: ResolvedClause[] = enabledClauses.map((clause) => {
    let body: string = clause.body_template ?? ""

    body = body.replaceAll(/\{\{ref:([a-z_]+)\}\}/g, (_, key: string) => {
      const num = clauseSnapshot[key]
      return num ? `clause ${num}.0` : "[not included in this agreement]"
    })

    body = body.replaceAll(/\{\{var:([a-z_]+)\}\}/g, (_, field: string) => {
      const val = (variables as unknown as Record<string, string>)[field]
      return val ?? `[${field}]`
    })

    // {{self:N}} is intentionally left unresolved — buildDocx handles it
    // via parseClauseBody + buildSelfLookup, same as generateLeaseDocument
    const clauseNum = clauseSnapshot[clause.clause_key]
    return {
      number: clauseNum,
      title: clause.title,
      body,
      clauseKey: clause.clause_key,
    }
  })

  // Build watermarked DOCX
  const docxBuffer = await buildDocx(leaseType, variables, resolvedClauses, [], true)

  const storagePath = `orgs/${orgId}/lease_samples/preview_${leaseType}.docx`

  await supabase.storage
    .from("documents")
    .upload(storagePath, docxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    })

  return { storagePath }
}
