/**
 * lib/queries/portfolio.ts — portfolio list + dashboard read queries, with shared React Query keys
 *
 * Auth:   takes a caller-supplied Supabase client (service-role via gateway()); always filter by orgId
 * Data:   tenant_view / landlord_view / contractor_view / leases / inspections / maintenance_requests
 * Notes:  Reads carry a fail-fast AbortSignal timeout (READ_TIMEOUT_MS) so a throttled/stalled DB
 *         surfaces an error in seconds instead of hanging the request (and bouncing the page) for
 *         minutes. Keys/stale-times are shared by the SSR prefetch, the client hooks, and
 *         PortfolioPrefetcher (which warms these caches sequentially, off the critical path).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWorkScope, type WorkScope } from "@/lib/work/myWorkFilter"

/** Fail-fast budget for a portfolio read — a throttled DB must error in seconds, not hang. */
const READ_TIMEOUT_MS = 10_000
const readTimeout = () => AbortSignal.timeout(READ_TIMEOUT_MS)

export const PORTFOLIO_QUERY_KEYS = {
  tenants: (orgId: string) => ["tenants", orgId] as const,
  landlords: (orgId: string) => ["landlords", orgId] as const,
  contractors: (orgId: string) => ["contractors", orgId] as const,
  leases: (orgId: string) => ["leases", orgId] as const,
  properties: (orgId: string) => ["properties", orgId] as const,
} as const

export const DASHBOARD_QUERY_KEYS = {
  metrics: (orgId: string) => ["dashboard-metrics", orgId] as const,
  attentionItems: (orgId: string) => ["attention-items", orgId] as const,
  activityFeed: (orgId: string) => ["activity-feed", orgId] as const,
} as const

export const OPERATIONAL_QUERY_KEYS = {
  inspections: (orgId: string) => ["inspections", orgId] as const,
  maintenance: (orgId: string) => ["maintenance", orgId] as const,
  applications: (orgId: string) => ["applications", orgId] as const,
  payments: (orgId: string) => ["payments", orgId] as const,
} as const

export const STALE_TIME = {
  tenants: 5 * 60 * 1000,
  landlords: 10 * 60 * 1000,
  contractors: 10 * 60 * 1000,
  leases: 5 * 60 * 1000,
  inspections: 2 * 60 * 1000,
  maintenance: 2 * 60 * 1000,
  applications: 2 * 60 * 1000,
  payments: 1 * 60 * 1000,
} as const

export async function fetchTenants(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("tenant_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone, juristic_type, turnover_under_2m, asset_value_under_2m, size_bands_captured_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .abortSignal(readTimeout())
  if (error) { console.error("fetchTenants failed:", error.message); return [] }
  return data ?? []
}

export async function fetchLandlords(supabase: SupabaseClient, orgId: string) {
  const [landlordsRes, propertiesRes] = await Promise.all([
    supabase
      .from("landlord_view")
      .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .abortSignal(readTimeout()),
    supabase
      .from("properties")
      .select("id, name, landlord_id")
      .eq("org_id", orgId)
      .not("landlord_id", "is", null)
      .is("deleted_at", null)
      .abortSignal(readTimeout()),
  ])
  if (landlordsRes.error) { console.error("fetchLandlords failed:", landlordsRes.error.message); return [] }
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
  const { data, error } = await supabase
    .from("contractor_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone, specialities, is_active, supplier_type")
    .eq("org_id", orgId)
    .abortSignal(readTimeout())
  if (error) {
    console.error("fetchContractors failed:", error.message)
    return []
  }
  return data ?? []
}

export async function fetchLeases(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("leases")
    .select(`
      id, status, lease_type, start_date, end_date, rent_amount_cents,
      notice_period_days, is_fixed_term, cpa_applies,
      auto_renewal_notice_sent_at,
      escalation_review_date, tenant_id,
      tenant_view(id, first_name, last_name, company_name, entity_type),
      units(unit_number, properties(name, suburb, city)),
      lease_co_tenants(tenant_id, tenants(id, contacts(first_name, last_name, company_name, entity_type)))
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .abortSignal(readTimeout())
  if (error) { console.error("fetchLeases failed:", error.message); return [] }
  return data ?? []
}

export async function fetchInspections(supabase: SupabaseClient, orgId: string, scope: WorkScope = "all", userId?: string) {
  let query = supabase
    .from("inspections")
    .select("id, inspection_type, lease_type, status, scheduled_date, conducted_date, assigned_user_id, units(unit_number, properties(name))")
    .eq("org_id", orgId)
  if (scope === "mine" && userId) query = applyWorkScope(query, "mine", userId)
  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) { console.error("fetchInspections failed:", error.message); return [] }
  return data ?? []
}

export async function fetchMaintenance(supabase: SupabaseClient, orgId: string, scope: WorkScope = "all", userId?: string) {
  let query = supabase
    .from("maintenance_requests")
    .select("id, title, category, urgency, status, work_order_number, contractor_id, logged_by, reported_via, created_at, assigned_user_id, handled_by, units(unit_number, properties(name, address_line1, suburb, city)), contractor_view(first_name, last_name, company_name)")
    .eq("org_id", orgId)
  if (scope === "mine" && userId) query = applyWorkScope(query, "mine", userId)
  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) { console.error("fetchMaintenance failed:", error.message); return [] }
  return data ?? []
}

export async function fetchApplications(supabase: SupabaseClient, orgId: string, scope: WorkScope = "all", userId?: string) {
  let query = supabase
    .from("applications")
    .select("id, first_name, last_name, applicant_email, stage1_status, stage2_status, prescreen_score, fitscore, gross_monthly_income_cents, is_foreign_national, has_co_applicant, applicant_motivation, created_at, assigned_user_id, handled_by, listing_id, listings(id, public_slug, asking_rent_cents, applications_count, units(unit_number, properties(name)))")
    .eq("org_id", orgId)
  if (scope === "mine" && userId) query = applyWorkScope(query, "mine", userId)
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100)
  if (error) { console.error("fetchApplications failed:", error.message); return [] }
  return data ?? []
}

export async function fetchPayments(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("id, invoice_number, description, amount_incl_vat_cents, invoice_date, status, payment_source, contractor_view(first_name, last_name, company_name), properties(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) { console.error("fetchPayments failed:", error.message); return [] }
  return data ?? []
}
