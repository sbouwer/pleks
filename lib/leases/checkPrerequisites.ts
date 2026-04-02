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

  const unit = lease.units as {
    unit_number: string
    assigned_agent_id: string | null
    properties: { id: string; landlord_id: string | null; managing_agent_id: string | null }
  } | null

  const property = unit?.properties ?? null
  const propertyId = property?.id ?? null
  const unitId = lease.unit_id

  // 1. Landlord assigned
  if (property?.landlord_id != null) {
    items.push({
      key: "landlord",
      label: "Landlord assigned",
      status: "pass",
      message: "Landlord is assigned to this property",
    })
  } else {
    items.push({
      key: "landlord",
      label: "Landlord assigned",
      status: "fail",
      message: "No landlord assigned to this property",
      action: propertyId
        ? { label: "Edit property →", href: `/properties/${propertyId}/edit` }
        : undefined,
    })
  }

  // 2. Managing agent assigned
  if (unit?.assigned_agent_id != null || property?.managing_agent_id != null) {
    items.push({
      key: "managing_agent",
      label: "Managing agent assigned",
      status: "pass",
      message: "An agent is assigned to this unit or property",
    })
  } else {
    items.push({
      key: "managing_agent",
      label: "Managing agent assigned",
      status: "fail",
      message: "No agent assigned to this unit or property",
      action:
        propertyId && unitId
          ? { label: "Edit unit →", href: `/properties/${propertyId}/units/${unitId}` }
          : undefined,
    })
  }

  // 3. Tenant on record
  const tenantView = lease.tenant_view as { id: string; first_name: string; last_name: string } | null
  if (lease.tenant_id != null && tenantView != null) {
    items.push({
      key: "tenant",
      label: "Tenant on record",
      status: "pass",
      message: "Tenant is linked to this lease",
    })
  } else {
    items.push({
      key: "tenant",
      label: "Tenant on record",
      status: "fail",
      message: "No tenant linked to this lease",
    })
  }

  // 4. Lease terms complete
  const termsComplete =
    lease.rent_amount_cents > 0 &&
    lease.start_date != null &&
    (lease.end_date != null || lease.is_fixed_term === false)

  if (termsComplete) {
    items.push({
      key: "lease_terms",
      label: "Lease terms complete",
      status: "pass",
      message: "Rent amount, start date, and end date are set",
    })
  } else {
    items.push({
      key: "lease_terms",
      label: "Lease terms complete",
      status: "fail",
      message: "Rent amount, start date, or end date is missing",
      action: { label: "Edit lease →", href: `/leases/${leaseId}/edit` },
    })
  }

  // 5. Deposit amount (residential only)
  if (lease.lease_type !== "residential") {
    // Skip for non-residential leases
  } else if (lease.deposit_amount_cents != null && lease.deposit_amount_cents > 0) {
    items.push({
      key: "deposit",
      label: "Deposit amount set",
      status: "pass",
      message: "Deposit amount is configured",
    })
  } else {
    items.push({
      key: "deposit",
      label: "Deposit amount set",
      status: "fail",
      message: "Deposit amount must be set for residential leases (RHA requirement)",
      action: { label: "Edit lease →", href: `/leases/${leaseId}/edit` },
    })
  }

  // 6. Trust account configured
  const { data: trustAccount } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "trust")
    .limit(1)

  if (trustAccount && trustAccount.length > 0) {
    items.push({
      key: "trust_account",
      label: "Trust account configured",
      status: "pass",
      message: "Trust account banking details are on file",
    })
  } else {
    items.push({
      key: "trust_account",
      label: "Trust account configured",
      status: "fail",
      message: "No trust account banking details on file",
      action: { label: "Configure banking →", href: "/settings/compliance" },
    })
  }

  // 7. Lease document (addendum rule)
  const hasDocument =
    lease.generated_doc_path != null ||
    lease.external_document_path != null ||
    lease.docuseal_document_url != null ||
    lease.migrated === true

  if (hasDocument) {
    items.push({
      key: "document",
      label: "Lease document",
      status: "pass",
      message: "Lease document is available",
    })
  } else {
    items.push({
      key: "document",
      label: "Lease document",
      status: "fail",
      message: "No lease document generated or uploaded",
      action: { label: "Generate →", href: `/leases/${leaseId}` },
    })
  }

  // 8. Clauses saved (addendum rule)
  const isExternalOrMigrated = lease.external_document_path != null || lease.migrated === true

  if (isExternalOrMigrated) {
    items.push({
      key: "clauses",
      label: "Clauses saved",
      status: "pass",
      message: "Not required for external documents",
    })
  } else {
    const { data: clauseSelections } = await supabase
      .from("lease_clause_selections")
      .select("id")
      .eq("lease_id", leaseId)
      .limit(1)

    if (clauseSelections && clauseSelections.length > 0) {
      items.push({
        key: "clauses",
        label: "Clauses saved",
        status: "pass",
        message: "Clause selections are saved for this lease",
      })
    } else {
      items.push({
        key: "clauses",
        label: "Clauses saved",
        status: "fail",
        message: "Clause selections have not been saved for this lease",
        action: { label: "Configure clauses →", href: `/leases/${leaseId}` },
      })
    }
  }

  // W1. Move-in inspection (warning)
  const { data: inspection } = await supabase
    .from("inspections")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("inspection_type", "move_in")
    .limit(1)

  if (!inspection || inspection.length === 0) {
    items.push({
      key: "move_in_inspection",
      label: "Move-in inspection",
      status: "warning",
      message: "No move-in inspection scheduled — recommended before tenant takes occupation",
      action: { label: "Schedule →", href: `/leases/${leaseId}` },
    })
  }

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
