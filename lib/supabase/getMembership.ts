import type { SupabaseClient } from "@supabase/supabase-js"

export interface OrgMembership {
  org_id: string
  role: string
  is_admin: boolean
  /** true if role === 'owner' OR is_admin === true */
  isAdmin: boolean
}

/**
 * Resolve org membership for a user.
 *
 * @param service  Service-role client (bypasses RLS)
 * @param userId   Authenticated user's UUID
 * @param orgId    If provided, also filters by org_id
 */
export async function getMembership(
  service: SupabaseClient,
  userId: string,
  orgId?: string
): Promise<OrgMembership | null> {
  const q = service
    .from("user_orgs")
    .select("org_id, role, is_admin")
    .eq("user_id", userId)
    .is("deleted_at", null)
  if (orgId) q.eq("org_id", orgId)
  const { data, error } = await q.single()
  if (error || !data) return null

  const row = data as { org_id: string; role: string; is_admin: boolean }
  return {
    org_id:  row.org_id,
    role:    row.role,
    is_admin: row.is_admin ?? false,
    isAdmin: row.role === "owner" || (row.is_admin ?? false),
  }
}
