/**
 * app/(onboarding)/welcome/layout.tsx — Welcome interstitial chrome
 *
 * Route:  /welcome
 * Auth:   authenticated agent (AAL1 island — factor not yet enrolled)
 * Notes:  Reuses public-site chrome so the page sits outside the dashboard shell.
 *         Identical shell to /onboarding — no dashboard nav, no sidebar.
 */
import { PublicThemeProvider } from "../../(public)/PublicThemeProvider"
import { PublicNav } from "../../(public)/PublicNav"
import "../../(public)/public.css"

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
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
