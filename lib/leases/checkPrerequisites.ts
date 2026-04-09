import { SupabaseClient } from "@supabase/supabase-js"

export interface PrerequisiteResult {
  key: string
  label: string
  status: "pass" | "fail" | "warning"
  message: string
  action?: { label: string; href: string }
}

export interface PrerequisitesCheck {
  items: PrerequisiteResult[]
  canProceed: boolean
  failCount: number
  warningCount: number
}

type LeaseUnitProperty = { id: string; landlord_id: string | null; managing_agent_id: string | null }

type LeaseUnit = {
  unit_number: string
  assigned_agent_id: string | null
  properties: LeaseUnitProperty
} | null

function checkLandlord(property: LeaseUnitProperty | null, propertyId: string | null): PrerequisiteResult {
  if (property?.landlord_id != null) {
    return { key: "landlord", label: "Landlord assigned", status: "pass", message: "Landlord is assigned to this property" }
  }
  return {
    key: "landlord", label: "Landlord assigned", status: "fail",
    message: "No landlord assigned to this property",
    action: propertyId ? { label: "Edit property →", href: `/properties/${propertyId}/edit` } : undefined,
  }
}

function checkManagingAgent(unit: LeaseUnit, property: LeaseUnitProperty | null, propertyId: string | null, unitId: string): PrerequisiteResult {
  if (unit?.assigned_agent_id != null || property?.managing_agent_id != null) {
    return { key: "managing_agent", label: "Managing agent assigned", status: "pass", message: "An agent is assigned to this unit or property" }
  }
  return {
    key: "managing_agent", label: "Managing agent assigned", status: "fail",
    message: "No agent assigned to this unit or property",
    action: propertyId && unitId ? { label: "Edit unit →", href: `/properties/${propertyId}/units/${unitId}` } : undefined,
  }
}

function checkTenant(lease: { tenant_id: string | null }, tenantView: { id: string } | null): PrerequisiteResult {
  if (lease.tenant_id != null && tenantView != null) {
    return { key: "tenant", label: "Tenant on record", status: "pass", message: "Tenant is linked to this lease" }
  }
  return { key: "tenant", label: "Tenant on record", status: "fail", message: "No tenant linked to this lease" }
}

function checkLeaseTerms(lease: { rent_amount_cents: number; start_date: string | null; end_date: string | null; is_fixed_term: boolean }, leaseId: string): PrerequisiteResult {
  const termsComplete =
    lease.rent_amount_cents > 0 &&
    lease.start_date != null &&
    (lease.end_date != null || lease.is_fixed_term === false)
  if (termsComplete) {
    return { key: "lease_terms", label: "Lease terms complete", status: "pass", message: "Rent amount, start date, and end date are set" }
  }
  return {
    key: "lease_terms", label: "Lease terms complete", status: "fail",
    message: "Rent amount, start date, or end date is missing",
    action: { label: "Edit lease →", href: `/leases/${leaseId}/edit` },
  }
}

function checkDeposit(lease: { lease_type: string; deposit_amount_cents: number | null }, leaseId: string): PrerequisiteResult | null {
  if (lease.lease_type !== "residential") return null
  if (lease.deposit_amount_cents != null && lease.deposit_amount_cents > 0) {
    return { key: "deposit", label: "Deposit amount set", status: "pass", message: "Deposit amount is configured" }
  }
  return {
    key: "deposit", label: "Deposit amount set", status: "fail",
    message: "Deposit amount must be set for residential leases (RHA requirement)",
    action: { label: "Edit lease →", href: `/leases/${leaseId}/edit` },
  }
}

function checkDocument(lease: { template_source: string; generated_doc_path: string | null; external_document_path: string | null; docuseal_document_url: string | null; migrated: boolean | null }, leaseId: string): PrerequisiteResult {
  const isUploadedLease = lease.template_source === "uploaded"
  const hasDocument =
    lease.generated_doc_path != null ||
    lease.external_document_path != null ||
    lease.docuseal_document_url != null ||
    lease.migrated === true
  if (hasDocument) {
    return { key: "document", label: "Lease document", status: "pass", message: "Lease document is available" }
  }
  return {
    key: "document", label: "Lease document", status: "fail",
    message: isUploadedLease ? "No lease document uploaded yet" : "No lease document generated or uploaded",
    action: { label: isUploadedLease ? "Upload →" : "Generate →", href: `/leases/${leaseId}` },
  }
}

function checkClausesExternal(isUploadedLease: boolean): PrerequisiteResult {
  return {
    key: "clauses", label: "Clauses saved", status: "pass",
    message: isUploadedLease ? "Not required for uploaded leases" : "Not required for external documents",
  }
}

async function checkTrustAccount(supabase: SupabaseClient, orgId: string): Promise<PrerequisiteResult> {
  const { data: trustAccount } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "trust")
    .limit(1)
  if (trustAccount && trustAccount.length > 0) {
    return { key: "trust_account", label: "Trust account configured", status: "pass", message: "Trust account banking details are on file" }
  }
  return {
    key: "trust_account", label: "Trust account configured", status: "fail",
    message: "No trust account banking details on file",
    action: { label: "Configure banking →", href: "/settings/compliance" },
  }
}

async function checkMoveInInspection(supabase: SupabaseClient, leaseId: string): Promise<PrerequisiteResult | null> {
  const { data: inspection } = await supabase
    .from("inspections")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("inspection_type", "move_in")
    .limit(1)
  if (!inspection || inspection.length === 0) {
    return {
      key: "move_in_inspection",
      label: "Move-in inspection",
      status: "warning",
      message: "No move-in inspection scheduled — recommended before tenant takes occupation",
      action: { label: "Schedule →", href: `/leases/${leaseId}` },
    }
  }
  return null
}

async function checkClausesStored(supabase: SupabaseClient, leaseId: string): Promise<PrerequisiteResult> {
  const { data: clauseSelections } = await supabase
    .from("lease_clause_selections")
    .select("id")
    .eq("lease_id", leaseId)
    .limit(1)
  if (clauseSelections && clauseSelections.length > 0) {
    return { key: "clauses", label: "Clauses saved", status: "pass", message: "Clause selections are saved for this lease" }
  }
  return {
    key: "clauses", label: "Clauses saved", status: "fail",
    message: "Clause selections have not been saved for this lease",
    action: { label: "Configure clauses →", href: `/leases/${leaseId}` },
  }
}

export async function checkLeasePrerequisites(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string
): Promise<PrerequisitesCheck> {
  const items: PrerequisiteResult[] = []

  // Fetch lease with unit, property, and tenant in one query
  const { data: lease } = await supabase
    .from("leases")
    .select("*, units(unit_number, assigned_agent_id, properties(id, landlord_id, managing_agent_id)), tenant_view(id, first_name, last_name)")
    .eq("id", leaseId)
    .single()

  if (!lease) {
    throw new Error("Lease not found")
  }

  const unit = lease.units as LeaseUnit
  const property = unit?.properties ?? null
  const propertyId = property?.id ?? null
  const unitId = lease.unit_id
  const tenantView = lease.tenant_view as { id: string; first_name: string; last_name: string } | null

  // 1. Landlord assigned
  items.push(checkLandlord(property, propertyId))

  // 2. Managing agent assigned
  items.push(checkManagingAgent(unit, property, propertyId, unitId))

  // 3. Tenant on record
  items.push(checkTenant(lease, tenantView))

  // 4. Lease terms complete
  items.push(checkLeaseTerms(lease, leaseId))

  // 5. Deposit amount (residential only)
  const depositCheck = checkDeposit(lease, leaseId)
  if (depositCheck) items.push(depositCheck)

  // 6. Trust account configured
  items.push(await checkTrustAccount(supabase, orgId))

  // 7. Lease document (addendum rule)
  items.push(checkDocument(lease, leaseId))

  // 8. Clauses saved — skip for uploaded leases and external/migrated leases
  const isUploadedLease = lease.template_source === "uploaded"
  const isExternalOrMigrated =
    lease.external_document_path != null || lease.migrated === true || isUploadedLease

  if (isExternalOrMigrated) {
    items.push(checkClausesExternal(isUploadedLease))
  } else {
    items.push(await checkClausesStored(supabase, leaseId))
  }

  // W1. Move-in inspection (warning)
  const moveInWarning = await checkMoveInInspection(supabase, leaseId)
  if (moveInWarning) items.push(moveInWarning)

  // W2. DebiCheck — always skip (no debicheck_enabled on org in current schema)
  // W3. Property rules — skip (no property_rules_id on leases yet)

  const failCount = items.filter((i) => i.status === "fail").length
  const warningCount = items.filter((i) => i.status === "warning").length

  return {
    items,
    canProceed: failCount === 0,
    failCount,
    warningCount,
  }
}
