/**
 * lib/auth/userEmail.ts — resolve a user's email from auth.users (it is NOT on user_profiles)
 *
 * Auth:   service client only (auth.admin)
 * Notes:  user_profiles holds full_name/phone but NOT email — email lives on auth.users. Selecting
 *         user_profiles(email) is a phantom column that silently returns null (it broke several email
 *         senders). Use this helper instead. PostgREST can't JOIN auth.users, so we go via the admin API.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** Resolve one user's email from auth.users, or null if absent/unresolvable. */
export async function getUserEmail(db: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) {
    console.error("getUserEmail failed:", error.message)
    return null
  }
  return data.user?.email ?? null
}
