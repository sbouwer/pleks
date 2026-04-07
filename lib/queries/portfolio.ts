import type { SupabaseClient } from "@supabase/supabase-js"

export const PORTFOLIO_QUERY_KEYS = {
  tenants: (orgId: string) => ["tenants", orgId] as const,
  landlords: (orgId: string) => ["landlords", orgId] as const,
  contractors: (orgId: string) => ["contractors", orgId] as const,
  leases: (orgId: string) => ["leases", orgId] as const,
} as const

export const STALE_TIME = {
  tenants: 5 * 60 * 1000,
  landlords: 10 * 60 * 1000,
  contractors: 10 * 60 * 1000,
  leases: 5 * 60 * 1000,
} as const

export async function fetchTenants(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase
    .from("tenant_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
    .eq("org_id", orgId)
    .is("deleted_at", null)
  return data ?? []
}

export async function fetchLandlords(supabase: SupabaseClient, orgId: string) {
  const [landlordsRes, propertiesRes] = await Promise.all([
    supabase
      .from("landlord_view")
      .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id, name, landlord_id")
      .eq("org_id", orgId)
      .not("landlord_id", "is", null)
      .is("deleted_at", null),
  ])
  const propsByLandlord: Record<string, string[]> = {}
  for (const p of propertiesRes.data ?? []) {
    if (p.landlord_id) {
      propsByLandlord[p.landlord_id] = propsByLandlord[p.landlord_id] ?? []
      propsByLandlord[p.landlord_id].push(p.name)
    }
  }
  return (landlordsRes.data ?? []).map((l) => ({ ...l, properties: propsByLandlord[l.id] ?? [] }))
}

export async function fetchContractors(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase
    .from("contractor_view")
    .select("id, contact_id, first_name, last_name, company_name, email, phone, specialities, is_active, supplier_type")
    .eq("org_id", orgId)
  return data ?? []
}

export async function fetchLeases(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase
    .from("leases")
    .select(`
      id, status, lease_type, start_date, end_date, rent_amount_cents,
      notice_period_days, is_fixed_term, cpa_applies,
      auto_renewal_notice_sent_at, debicheck_mandate_status,
      escalation_review_date, tenant_id,
      tenant_view(id, first_name, last_name, company_name, entity_type),
      units(unit_number, properties(name, suburb, city)),
      lease_co_tenants(tenant_id, tenants(id, contacts(first_name, last_name, company_name, entity_type)))
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  return data ?? []
}
