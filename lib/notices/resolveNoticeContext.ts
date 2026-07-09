/**
 * lib/notices/resolveNoticeContext.ts — resolve the recipient + service addresses for a Demand to Vacate
 *
 * Notes:  LEG-NOTICES-01 Phase E-2. Turns a lease into the escalated-service context: tenant name, the
 *         domicilium display string, every service email (domicilium + tenant + all active contact_emails),
 *         phones, and active sureties (lease_sureties released_at IS NULL) with their emails. Q11/Q12
 *         (R7.3): a lease with NO electronic service address at all is manual-attestation territory —
 *         needsManualAttestation=true — NEVER a silent email-only fan-out. The caller then requires the
 *         agent to record physical service (R-5 attestation) instead of relying on electronic dispatch.
 */

import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export interface ResolvedSurety { contactId: string | null; name: string; email: string | null }

export interface NoticeContext {
  tenantName: string
  contactId: string | null
  tenantId: string
  serviceAddress: string          // domicilium display string
  emails: string[]                // every electronic service address (deduped)
  phones: string[]
  sureties: ResolvedSurety[]
  /** No electronic service address on record → manual-attestation territory (Q11/Q12), not email-only. */
  needsManualAttestation: boolean
}

interface ServiceAddressJson {
  line1?: string; line2?: string; city?: string; province?: string; postal_code?: string
  email?: string; phone?: string
}

export interface ContextLease {
  id: string
  tenant_id: string
  service_address: ServiceAddressJson | null
}

function formatServiceAddress(sa: ServiceAddressJson): string {
  const parts = [sa.line1, sa.line2, sa.city, sa.province, sa.postal_code].filter(Boolean)
  return parts.join(", ")
}

async function resolveSureties(db: Db, orgId: string, leaseId: string): Promise<ResolvedSurety[]> {
  const { data: rows, error } = await db.from("lease_sureties")
    .select("contact_id, full_name").eq("org_id", orgId).eq("lease_id", leaseId).is("released_at", null)
  logQueryError("resolveNoticeContext lease_sureties", error)
  const out: ResolvedSurety[] = []
  for (const s of rows ?? []) {
    let email: string | null = null
    let name = (s.full_name as string | null) ?? "Surety"
    if (s.contact_id) {
      const { data: c, error: cErr } = await db.from("contacts")
        .select("primary_email, first_name, last_name").eq("org_id", orgId).eq("id", s.contact_id).maybeSingle()
      logQueryError("resolveNoticeContext surety contact", cErr)
      email = (c?.primary_email as string | null) ?? null
      if (!s.full_name) name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Surety"
    }
    out.push({ contactId: (s.contact_id as string | null) ?? null, name, email })
  }
  return out
}

export async function resolveNoticeContext(db: Db, orgId: string, lease: ContextLease): Promise<NoticeContext> {
  const sa: ServiceAddressJson = lease.service_address ?? {}

  const [tenantRes, tenantRow] = await Promise.all([
    db.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).maybeSingle(),
    db.from("tenants").select("contact_id").eq("org_id", orgId).eq("id", lease.tenant_id).maybeSingle(),
  ])
  logQueryError("resolveNoticeContext tenant_view", tenantRes.error)
  logQueryError("resolveNoticeContext tenants", tenantRow.error)
  const t = tenantRes.data
  const contactId = (tenantRow.data?.contact_id as string | null) ?? null
  const tenantName = [t?.first_name, t?.last_name].filter(Boolean).join(" ") || "Tenant"

  let contactEmails: string[] = []
  if (contactId) {
    const { data, error } = await db.from("contact_emails")
      .select("email").eq("org_id", orgId).eq("contact_id", contactId).eq("is_active", true)
    logQueryError("resolveNoticeContext contact_emails", error)
    contactEmails = (data ?? []).map((r) => r.email as string).filter(Boolean)
  }

  const emails = Array.from(new Set([sa.email, t?.email as string | undefined, ...contactEmails].filter(Boolean))) as string[]
  const phones = Array.from(new Set([sa.phone, t?.phone as string | undefined].filter(Boolean))) as string[]
  const sureties = await resolveSureties(db, orgId, lease.id)

  return {
    tenantName,
    contactId,
    tenantId: lease.tenant_id,
    serviceAddress: formatServiceAddress(sa) || "(no service address on record)",
    emails,
    phones,
    sureties,
    needsManualAttestation: emails.length === 0,
  }
}
