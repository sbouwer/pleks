"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { gateway } from "@/lib/supabase/gateway"

/**
 * Send a magic-link invite to the tenant's primary email.
 * Sets `tenants.portal_invite_sent_at` and logs to audit_log.
 */
export async function inviteTenantPortal(tenantId: string, _leaseId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { db, userId, orgId } = gw

  // Fetch tenant + primary email via tenant_view
  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, email")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (tenantErr || !tenant) return { error: "Tenant not found" }
  if (!tenant.email) return { error: "Tenant has no email address on file" }

  const displayName = tenant.company_name ||
    `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() ||
    "Tenant"

  const service = await createServiceClient()

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(
    tenant.email,
    {
      data: {
        role: "tenant",
        tenant_id: tenantId,
        org_id: orgId,
        full_name: displayName,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
    }
  )

  if (inviteError) return { error: inviteError.message }

  await db.from("tenants")
    .update({ portal_invite_sent_at: new Date().toISOString() })
    .eq("id", tenantId)
    .eq("org_id", orgId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenants",
    record_id: tenantId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { action: "portal_invite_sent", sent_to: tenant.email },
  })

  return { success: true }
}

/**
 * Generate a 90-day token link for tenants who can't use email magic links.
 * Returns the full URL to share via WhatsApp.
 */
export async function generateTenantPortalLink(tenantId: string, _leaseId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { db, userId, orgId } = gw

  // Verify tenant is in this org
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (tenantErr || !tenant) return { error: "Tenant not found" }

  // Create token record
  const { data: tokenRecord, error: tokenErr } = await db
    .from("tenant_portal_tokens")
    .insert({
      org_id: orgId,
      tenant_id: tenantId,
      lease_id: _leaseId,
      created_by: userId,
    })
    .select("token")
    .single()

  if (tokenErr || !tokenRecord) return { error: "Could not generate token" }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenant_portal_tokens",
    record_id: tokenRecord.token,
    action: "INSERT",
    changed_by: userId,
    new_values: { action: "portal_token_generated", tenant_id: tenantId },
  })

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/portal/access?token=${tokenRecord.token}`
  return { success: true, url }
}

/**
 * Revoke all portal access for a tenant (magic link + tokens).
 */
export async function revokeTenantPortalAccess(tenantId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { db, userId, orgId } = gw

  // Revoke all tokens
  await db.from("tenant_portal_tokens")
    .update({ revoked: true })
    .eq("tenant_id", tenantId)
    .eq("org_id", orgId)

  // Clear auth_user_id (prevents magic link re-use)
  await db.from("tenants")
    .update({ auth_user_id: null })
    .eq("id", tenantId)
    .eq("org_id", orgId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenants",
    record_id: tenantId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { action: "portal_access_revoked" },
  })

  return { success: true }
}
