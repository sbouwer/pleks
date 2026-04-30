/**
 * lib/feedback/rate-limit.ts — Rate-limit helper for feedback submissions
 *
 * Auth:   Server-only — called from API routes after user auth is verified
 * Notes:  5 submissions per user per 24 hours; fail-open on DB error (don't block legit feedback)
 */
import { createServiceClient } from "@/lib/supabase/server"

export async function isFeedbackRateLimited(userId: string): Promise<boolean> {
  const service = await createServiceClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await service
    .from("feedback_submissions")
    .select("id", { count: "exact", head: true })
    .eq("submitter_id", userId)
    .gte("created_at", since)
  if (error) {
    console.error("feedback rate-limit check failed:", error.message)
    return false
  }
  return (count ?? 0) >= 5
}
