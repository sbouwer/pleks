/**
 * app/(dashboard)/dashboard/onboarding-progress.ts — which first-run setup steps an org has completed
 *
 * Data:   derived in app/(dashboard)/dashboard/page.tsx from live counts per entity; this module
 *         declares the shape only and holds no data of its own.
 * Notes:  Lives apart from GettingStarted so OnboardingWizard can import the type without importing
 *         its own parent. GettingStarted declared it and rendered OnboardingWizard, which imported
 *         it back — a circular import that compiled only because the edge is type-only. Both
 *         components derive their StepKey from `keyof` this interface, so the step sets cannot
 *         drift apart; keep it that way rather than restating the keys in either file.
 */
export interface GettingStartedProgress {
  landlord:   boolean
  property:   boolean
  tenant:     boolean
  lease:      boolean
  inspection: boolean
  supplier:   boolean
}
