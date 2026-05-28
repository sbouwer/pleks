/**
 * app/(onboarding)/welcome/layout.tsx — passthrough; chrome lives in parent (onboarding)/layout.tsx
 *
 * Route:  /welcome
 * Auth:   authenticated agent (AAL1 island — MFA not yet enrolled)
 */
export default function WelcomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
