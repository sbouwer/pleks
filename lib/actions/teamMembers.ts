"use server"

/**
 * lib/actions/teamMembers.ts — member email lookup for the Team members list
 *
 * Auth:   gateway() — caller must be a member of the org; scoped to gw.orgId (the param is ignored).
 * Data:   user_orgs (org member user_ids) → auth.users email via admin.getUserById (service client).
 * Notes:  Member email lives on auth.users, not client-readable — fetched server-side. Returns a
 *         { userId: email } map the client merges into the list. Small N (one org's members).
 */
import { gateway } from "@/lib/supabase/gateway"

export async function getMemberEmails(): Promise<Record<string, string>> {
  const gw = await gateway()
  if (!gw) return {}
  const { db, orgId } = gw

  const { data: members, error } = await db
    .from("user_orgs")
    .select("user_id")
    .eq("org_id", orgId)
  if (error) {
    console.error("getMemberEmails user_orgs:", error.message)
    return {}
  }

  const map: Record<string, string> = {}
  for (const m of members ?? []) {
    const uid = m.user_id as string
    const { data } = await db.auth.admin.getUserById(uid)
    if (data?.user?.email) map[uid] = data.user.email
  }
  return map
}
