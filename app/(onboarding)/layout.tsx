/**
 * app/(onboarding)/layout.tsx — Shared focused shell for /welcome and /onboarding
 *
 * Auth:   each sub-route gated individually via manifest.ts
 * Notes:  Drops PublicNav — distraction-free focused environment.
 *         Provides: 4-layer static backdrop, centered brand wordmark, panel-wrap container.
 *         Sub-routes render their own card (ob-panel or .pa-modal) inside ob-panel-wrap.
 *         No backdrop-filter — works on mid-range Android / 3G; ~6KB CSS budget.
 */
import Link from "next/link"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { PublicThemeProvider } from "../(public)/PublicThemeProvider"
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
          <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ marginBottom: 40 }}>
            <span className="pub-wm-name">plek<AccentBracket>s</AccentBracket></span>
          </Link>

          <div className="ob-panel-wrap">
            {children}
          </div>

          <Link href="/" className="ob-back-home">
            ← Back to homepage
          </Link>
        </div>
      </div>
    </PublicThemeProvider>
  )
}
