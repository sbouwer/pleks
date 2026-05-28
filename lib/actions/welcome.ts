"use server"

/**
 * lib/actions/welcome.ts — markWelcomeSeen server action
 *
 * Auth:   authenticated agent (cookie session)
 * Data:   writes user_profiles.welcome_seen via service client
 * Notes:  Called when the user clicks "Continue to Pleks" at the end of the /welcome
 *         interstitial. Sets the per-user flag that prevents re-showing Welcome on
 *         subsequent logins.
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function markWelcomeSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const service = await createServiceClient()
  const { error } = await service
    .from("user_profiles")
    .update({ welcome_seen: true })
    .eq("id", user.id)

  if (error) {
    console.error("[welcome] markWelcomeSeen failed:", error.message)
  }
}
