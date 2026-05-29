"use client"

/**
 * app/global-error.tsx — Root error boundary wired to Sentry
 *
 * Notes: Next.js renders this when an unhandled error escapes the root layout (it sits
 *        ABOVE every route + segment error.tsx). Must be "use client" and render its own
 *        <html>/<body> — the root layout, globals.css, fonts and providers are all
 *        unavailable here, so styling is inline-only with literal oklch brand colours
 *        (no CSS vars). The most common trigger in practice is a transient RSC-stream
 *        error during a redirect that is ALREADY completing (welcome→resolver→dashboard),
 *        so we auto-recover once rather than dead-stopping on a manual "Try again".
 */
import * as Sentry from "@sentry/nextjs"
import { useEffect, useState } from "react"

// Brand palette (warm paper theme — matches onboarding/welcome). Literal oklch because
// globals.css / CSS custom properties are not applied to global-error's own document.
const INK = "oklch(0.18 0.012 260)"
const INK_SOFT = "oklch(0.45 0.02 260)"
const PAPER = "oklch(0.985 0.004 85)"
const AMBER = "oklch(0.75 0.14 65)"
const TRACK = "oklch(0.9 0.01 85)"

// Module-scoped so it survives boundary remounts within the tab: auto-recover ONCE from a
// transient nav-time throw, but if the error recurs right after our reset, stop
// auto-resetting and show the manual UI — prevents a reset↔throw loop on a genuine error.
let lastAutoResetAt = 0

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Default to the calm "recovering" view so a transient nav error never flashes a scary
  // crash screen; the effect flips to manual only if the error recurs after our auto-reset.
  const [phase, setPhase] = useState<"recovering" | "manual">("recovering")

  useEffect(() => {
    Sentry.captureException(error)
    const now = Date.now()
    if (now - lastAutoResetAt < 8000) {
      // Recurred soon after our auto-reset → treat as a genuine error; show manual UI.
      setPhase("manual")
      return
    }
    lastAutoResetAt = now
    // Auto-reset after a short beat: if the navigation has landed, reset() renders the new
    // route; if not, the recurrence path above takes over on the next fire.
    const t = setTimeout(() => {
      try { reset() } catch { setPhase("manual") }
    }, 1500)
    return () => clearTimeout(t)
  }, [error, reset])

  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: PAPER, color: INK, padding: "2rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          {phase === "recovering" ? (
            <>
              <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>One moment…</p>
              <p style={{ fontSize: 14, color: INK_SOFT, margin: "0 0 22px" }}>Taking you to your dashboard.</p>
              <div style={{ position: "relative", height: 3, width: 160, margin: "0 auto", background: TRACK, overflow: "hidden", borderRadius: 2 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: AMBER, animation: "pleks-ge-bar 1.1s ease-in-out infinite" }} />
              </div>
              <style>{"@keyframes pleks-ge-bar{0%{left:-40%}100%{left:100%}}"}</style>
            </>
          ) : (
            <>
              <p style={{ fontSize: 19, fontWeight: 600, margin: "0 0 8px" }}>Something interrupted that.</p>
              <p style={{ fontSize: 14, color: INK_SOFT, margin: "0 0 24px", lineHeight: 1.5 }}>
                Your account is safe. Try again, or reach us if it keeps happening.
              </p>
              <button
                type="button"
                onClick={() => { setPhase("recovering"); reset() }}
                style={{
                  position: "relative", border: "none", background: INK, color: PAPER,
                  fontSize: 14, fontWeight: 600, padding: "12px 24px", cursor: "pointer",
                  borderBottom: `3px solid ${AMBER}`,
                }}
              >
                Try again
              </button>
              <div style={{ marginTop: 18, fontSize: 13 }}>
                <a href="mailto:support@pleks.co.za" style={{ color: INK_SOFT }}>Get help</a>
              </div>
            </>
          )}
        </div>
      </body>
    </html>
  )
}
