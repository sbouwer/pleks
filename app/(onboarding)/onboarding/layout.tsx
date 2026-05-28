/**
 * app/(onboarding)/onboarding/layout.tsx — passthrough; chrome lives in parent (onboarding)/layout.tsx
 *
 * Route:  /onboarding
 * Auth:   authenticated (manifest: skipOrgCheck — org does not exist yet)
 */
export default function OnboardingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
