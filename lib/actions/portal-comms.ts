"use server"

/**
 * lib/actions/portal-comms.ts — tenant portal communication actions
 *
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log, communication_delivery_events via service client
 * Notes:  portal_view events are evidence-grade — they short-circuit retry queues
 *         and appear in Tribunal exports. Uses service client since tenants have
 *         no Supabase role. Ownership verified via tenant session.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"

export async function recordPortalView(logId: string): Promise<{ success: boolean; error?: string }> {
  const session = await getTenantSession()
  if (!session) return { success: false, error: "Not authenticated" }

  const service = await createServiceClient()

  // Verify comm belongs to this tenant
  const { data: comm, error: commError } = await service
    .from("communication_log")
    .select("id, org_id, tenant_id")
    .eq("id", logId)
    .eq("tenant_id", session.tenantId)
    .single()

  if (commError || !comm) return { success: false, error: "Communication not found" }

  const { error } = await service.from("communication_delivery_events").insert({
    org_id:               comm.org_id,
    communication_log_id: logId,
    event_type:           "portal_view",
    provider:             "pleks_portal",
    occurred_at:          new Date().toISOString(),
    raw_payload:          { tenant_id: session.tenantId, lease_id: session.leaseId },
  })

  if (error) {
    console.error("[recordPortalView] insert failed:", error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}
