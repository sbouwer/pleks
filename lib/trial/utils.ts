// Computes days remaining until a target date.
// This inherently requires the current time — it's intentionally
// time-dependent and not expected to be pure across renders.

export function computeTrialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null
  const end = new Date(trialEndsAt).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
}
