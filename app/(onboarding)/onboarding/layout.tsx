/**
 * app/(onboarding)/onboarding/layout.tsx — Onboarding wizard chrome
 *
 * Route:  /onboarding
 * Auth:   authenticated (manifest: skipOrgCheck — org does not exist yet)
 * Notes:  Layout renders chrome only. If a user with an active membership arrives here,
 *         the resolver should have caught them — this layout no longer redirects (I-1).
 */
import { PublicThemeProvider } from "../../(public)/PublicThemeProvider"
import { PublicNav } from "../../(public)/PublicNav"
import "../../(public)/public.css"

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicThemeProvider>
      <PublicNav />
      <div style={{ minHeight: "calc(100vh - 64px)", display: "flex", justifyContent: "center", padding: "56px 20px 80px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          {children}
        </div>
      </div>
    </PublicThemeProvider>
  )
}
