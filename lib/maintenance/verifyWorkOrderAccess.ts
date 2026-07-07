/**
 * lib/maintenance/verifyWorkOrderAccess.ts — resolve + authenticate a contractor work-order portal request
 *
 * Auth:   the URL work_order_number is authoritative; token must equal work_order_token AND
 *         work_order_token_revoked_at must be null (mirrors the /wo/[workOrderNumber] page gate).
 * Data:   reads maintenance_requests (service client).
 * Notes:  Shared by the /api/wo/[number]/{update,quote,invoice} write routes. Identity is derived from
 *         the URL segment, never from a caller-supplied body id — closes the [number]-vs-body-id
 *         divergence AND the revoked-token write bypass (the page checked revocation; the write routes
 *         did not, so a reassigned contractor's stale token still authorised writes, incl. a
 *         payment-bearing supplier_invoices insert). Returns the resolved row or null on any failure.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface WorkOrderAccess {
  id: string
  org_id: string
  contractor_id: string | null
  property_id: string | null
  unit_id: string | null
  status: string
}

export async function verifyWorkOrderAccess(
  supabase: SupabaseClient,
  workOrderNumber: string,
  token: string,
): Promise<WorkOrderAccess | null> {
  if (!workOrderNumber || !token) return null

  const { data: request, error } = await supabase
    .from("maintenance_requests")
    .select("id, org_id, contractor_id, property_id, unit_id, status, work_order_token, work_order_token_revoked_at")
    .eq("work_order_number", workOrderNumber)
    .maybeSingle()
  logQueryError("verifyWorkOrderAccess maintenance_requests", error)

  if (!request) return null
  if (request.work_order_token !== token) return null
  if (request.work_order_token_revoked_at) return null

  return {
    id:            request.id,
    org_id:        request.org_id,
    contractor_id: request.contractor_id,
    property_id:   request.property_id,
    unit_id:       request.unit_id,
    status:        request.status,
  }
}
