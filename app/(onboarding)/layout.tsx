/**
 * app/(onboarding)/layout.tsx — Shared focused shell for /welcome and /onboarding
 *
 * Auth:   each sub-route gated individually via manifest.ts
 * Notes:  Drops PublicNav — distraction-free focused environment.
 *         Provides: 4-layer static backdrop, centered brand wordmark, panel-wrap container.
 *         Sub-routes render their own card (ob-panel or .pa-modal) inside ob-panel-wrap.
 *         No backdrop-filter — works on mid-range Android / 3G; ~6KB CSS budget.
 *         Wordmark + back-home use absolute MARKETING_URL — app.pleks.co.za/ redirects
 *         cross-origin to pleks.co.za/, so <Link href="/"> triggers a CORS-blocked prefetch.
 */
import { Wordmark } from "@/components/ui/Wordmark"
import { PublicThemeProvider } from "../(public)/PublicThemeProvider"
import { MARKETING_URL } from "@/lib/env"
import "../(public)/public.css"
import "./onboarding-shell.css"

export default function OnboardingGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicThemeProvider>
      <div className="ob-shell">
        {/* Static backdrop — 4 CSS layers, no backdrop-filter */}
        <div className="ob-bd-gradient" aria-hidden="true"/>
        <div className="ob-bd-glow"     aria-hidden="true"/>
        <div className="ob-bd-hatch"    aria-hidden="true"/>
        <div className="ob-bd-vignette" aria-hidden="true"/>

        <div className="ob-content">
          <Wordmark href={MARKETING_URL} external style={{ marginBottom: 40 }} />

          <div className="ob-panel-wrap">
            {children}
          </div>

          <a href={MARKETING_URL} className="ob-back-home">
            ← Back to homepage
          </a>
        </div>
      </div>
    </PublicThemeProvider>
  )
}
