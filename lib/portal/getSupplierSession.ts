/**
 * lib/portal/getSupplierSession.ts — Authenticate and resolve supplier (contractor) portal session
 *
 * Auth:   Supabase auth — suppliers are REAL auth users (unlike token-based landlord/tenant
 *         sessions), so identity comes from the cookie client's auth.getUser(); the contractor row
 *         is then resolved via the SERVICE client (never the cookie client for DB reads — server.ts).
 * Data:   contractors + contacts via service client, scoped by auth_user_id + portal_access_enabled
 * Notes:  ADDENDUM_00M — the supplier portal must NOT read RLS-base tables/views on the cookie
 *         client (it relied on the contractor_view/tenant_view definer bypass). This resolves the
 *         contractor row server-side via service; callers then scope every read by contractorId.
 *         Returns null (not redirect) so callers control the redirect; cached per render tree.
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cache } from "react"
import { setSentryUser } from "@/lib/observability/user-context"

export interface SupplierSession {
  /** auth.users.id — suppliers are real auth users; use for own-row scoping (auth_user_id). */
  userId: string
  contractorId: string
  orgId: string
  displayName: string
}

export const getSupplierSession = cache(async (): Promise<SupplierSession | null> => {
  const cookie = await createClient()
  const { data: { user } } = await cookie.auth.getUser()
  if (!user) return null

  const service = await createServiceClient()
  const { data: contractor } = await service
    .from("contractors")
    .select("id, org_id, portal_access_enabled, deleted_at, contacts(first_name, last_name, company_name)")
    .eq("auth_user_id", user.id)
    .eq("portal_access_enabled", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()
  if (!contractor) return null

  const contact = contractor.contacts as unknown as
    { first_name: string | null; last_name: string | null; company_name: string | null } | null
  const displayName =
    contact?.company_name ||
    `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
    "Supplier"

  setSentryUser({ id: user.id, org_id: contractor.org_id, role: "supplier", scope_id: contractor.id })
  return {
    userId: user.id,
    contractorId: contractor.id,
    orgId: contractor.org_id,
    displayName,
  }
})
