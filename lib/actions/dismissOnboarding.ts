"use server"

/**
 * lib/actions/dismissOnboarding.ts — dashboard guided-setup dismissal (org-level)
 *
 * Auth:   requireAgentWriteAccess (org must be active)
 * Data:   organisations.onboarding_dismissed_at (010 §38)
 * Notes:  The dashboard shows the guided new-user onboarding until this is stamped. Finishing or
 *         skipping the get-started flow calls dismissOnboarding() → the populated dashboard. resume…
 *         clears it (a "set up again" affordance). Per-org: once set, the whole team sees the populated
 *         dashboard. Returns a result object — callers router.refresh() to re-render the server page.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"

export interface OnboardingResult { ok: boolean; error?: string }

async function setDismissedAt(action: string, value: string | null): Promise<OnboardingResult> {
  try {
    const { db, orgId } = await requireAgentWriteAccess(action)
    const { error } = await db
      .from("organisations")
      .update({ onboarding_dismissed_at: value })
      .eq("id", orgId)
    if (error) {
      console.error(`${action} failed:`, error.message)
      return { ok: false, error: error.message }
    }
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update onboarding" }
  }
}

/** Mark the org's guided onboarding as finished/skipped → the populated dashboard. */
export async function dismissOnboarding(): Promise<OnboardingResult> {
  return setDismissedAt("dismiss_onboarding", new Date().toISOString())
}

/** Re-open the guided onboarding (a "set up again" affordance). */
export async function resumeOnboarding(): Promise<OnboardingResult> {
  return setDismissedAt("resume_onboarding", null)
}
