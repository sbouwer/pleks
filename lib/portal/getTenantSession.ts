import { cache } from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export interface TenantPortalSession {
  tenantId: string
  leaseId: string
  orgId: string
  unitId: string
  authType: "magic_link" | "token"
  tenantName: string
  /** Raw active lease data for portal pages */
  lease: {
    id: string
    status: string
    lease_type: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent_cents: number | null
    deposit_cents: number | null
    escalation_rate: number | null
    next_escalation_date: string | null
    payment_due_day: number | null
    template_source: string
    generated_doc_path: string | null
    external_document_path: string | null
    payment_reference: string | null
  }
}

const COOKIE_NAME = "pleks_tenant_token"

/**
 * Resolves the tenant portal session.
 *
 * Priority:
 *   1. Supabase magic-link session (auth.getUser → tenants.auth_user_id)
 *   2. Token cookie (set by /portal/access?token=xxx → cookie → every page)
 *
 * React.cache() deduplicates per SSR render tree.
 */
export const getTenantSession = cache(
  async (): Promise<TenantPortalSession | null> => {
    const service = await createServiceClient()

    // ── Path 1: Supabase auth ─────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: tenant, error } = await service
        .from("tenants")
        .select("id, org_id, auth_user_id, contacts(first_name, last_name, company_name)")
        .eq("auth_user_id", user.id)
        .is("deleted_at", null)
        .single()

      if (!error && tenant) {
        const activeLeaseResult = await getActiveLease(service, tenant.id, tenant.org_id)
        if (activeLeaseResult) {
          // Update last login (fire and forget)
          service.from("tenants")
            .update({ portal_last_login_at: new Date().toISOString() })
            .eq("id", tenant.id)
            .then(() => { /* non-blocking */ })

          const contact = tenant.contacts as unknown as {
            first_name: string | null; last_name: string | null; company_name: string | null
          } | null
          const tenantName = contact?.company_name ||
            `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
            "Tenant"

          return {
            tenantId: tenant.id,
            leaseId: activeLeaseResult.leaseId,
            unitId: activeLeaseResult.unitId,
            orgId: tenant.org_id,
            authType: "magic_link",
            tenantName,
            lease: activeLeaseResult.lease,
          }
        }
      }
    }

    // ── Path 2: Token cookie ──────────────────────────────────────────
    const cookieStore = await cookies()
    const tokenCookie = cookieStore.get(COOKIE_NAME)
    if (!tokenCookie?.value) return null

    const { data: tokenRecord, error: tokenError } = await service
      .from("tenant_portal_tokens")
      .select(`
        id, tenant_id, lease_id, org_id,
        tenants(id, org_id, contacts(first_name, last_name, company_name))
      `)
      .eq("token", tokenCookie.value)
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (tokenError || !tokenRecord) return null

    const leaseResult = await getLeaseById(service, tokenRecord.lease_id, tokenRecord.org_id)
    if (!leaseResult) return null

    const tenantData = tokenRecord.tenants as unknown as {
      id: string
      org_id: string
      contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null
    } | null

    const contact = tenantData?.contacts
    const tenantName = contact?.company_name ||
      `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
      "Tenant"

    return {
      tenantId: tokenRecord.tenant_id,
      leaseId: tokenRecord.lease_id,
      unitId: leaseResult.unitId,
      orgId: tokenRecord.org_id,
      authType: "token",
      tenantName,
      lease: leaseResult.lease,
    }
  }
)

// ── Internal helpers ──────────────────────────────────────────────────

async function getActiveLease(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  tenantId: string,
  orgId: string
) {
  const { data: lease, error } = await service
    .from("leases")
    .select(`
      id, status, lease_type, start_date, end_date,
      monthly_rent_cents, deposit_cents,
      escalation_rate, next_escalation_date, payment_due_day,
      template_source, generated_doc_path, external_document_path,
      payment_reference, unit_id
    `)
    .eq("tenant_id", tenantId)
    .eq("org_id", orgId)
    .in("status", ["active", "draft"])
    .order("start_date", { ascending: false })
    .limit(1)
    .single()

  if (error || !lease) return null

  return {
    leaseId: lease.id,
    unitId: lease.unit_id as string,
    lease: lease as TenantPortalSession["lease"],
  }
}

async function getLeaseById(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  leaseId: string,
  orgId: string
) {
  const { data: lease, error } = await service
    .from("leases")
    .select(`
      id, status, lease_type, start_date, end_date,
      monthly_rent_cents, deposit_cents,
      escalation_rate, next_escalation_date, payment_due_day,
      template_source, generated_doc_path, external_document_path,
      payment_reference, unit_id
    `)
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (error || !lease) return null

  return {
    leaseId: lease.id,
    unitId: lease.unit_id as string,
    lease: lease as TenantPortalSession["lease"],
  }
}
