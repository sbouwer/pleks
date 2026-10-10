/**
 * lib/consent/saveLeaseConsent.ts — upsert a tenant's messaging consent captured at lease creation
 *
 * Auth:   none of its own — its sole caller is createLease (lib/actions/leases.ts, requireAgentWriteAccess),
 *         which passes its gateway orgId and the lease's tenantId. Deliberately NOT a "use server" module:
 *         every export of one is a callable action endpoint, and this trusts its caller's tenantId + orgId.
 * Data:   tenant_messaging_consent (upsert on tenant_id) via service client
 */
import { createServiceClient } from "@/lib/supabase/server"

export async function saveLeaseConsent(params: {
  tenantId: string
  orgId: string
  emailEnabled: boolean
  whatsappEnabled: boolean
  smsEnabled: boolean
}): Promise<{ error?: string }> {
  const db = await createServiceClient()

  const { error } = await db
    .from("tenant_messaging_consent")
    // validated-caller: sole caller is createLease (lib/actions/leases.ts, requireAgentWriteAccess-gated) passing gw.orgId + the lease's tenantId; org_id in payload is that gateway orgId
    .upsert(
      {
        tenant_id: params.tenantId,
        org_id: params.orgId,
        email_enabled: params.emailEnabled,
        whatsapp_enabled: params.whatsappEnabled,
        sms_enabled: params.smsEnabled,
        consent_captured_by: "lease_creation",
        consent_captured_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )

  if (error) {
    console.error("saveLeaseConsent failed:", error.message)
    return { error: "Failed to save consent" }
  }
  return {}
}
