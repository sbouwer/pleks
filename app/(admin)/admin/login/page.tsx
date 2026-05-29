"use client"

/**
 * app/(admin)/admin/login/page.tsx — Admin login form
 *
 * Route:  /admin/login  (served only on admin.pleks.co.za)
 * Auth:   none — this IS the login page; proxy exempts it from the HMAC gate
 * Notes:  POSTs to /api/admin/auth which sets pleks_admin_token (host-scoped to
 *         admin.pleks.co.za, HttpOnly, SameSite=Strict). No Supabase involved.
 *         Wrapped in PublicThemeProvider + focus-shell so it shares the warm
 *         "door" look and feel with the onboarding surface.
 */
import { useState } from "react"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { PublicThemeProvider } from "@/app/(public)/PublicThemeProvider"
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/app/(public)/public.css"
import "@/components/layout/focus-shell.css"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.pleks.co.za"

export default function AdminLoginPage() {
  const [secret, setSecret] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    })

    if (!res.ok) {
      setError("Access denied")
      setLoading(false)
      return
    }

    globalThis.location.href = "/admin"
  }

  return (
    <PublicThemeProvider>
      <div className="fs-shell">
        <FocusBackdrop />
        <div className="fs-content">
          <span className="pub-wordmark" aria-label="Pleks" style={{ fontSize: 28, marginBottom: 32 }}>
            <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
          </span>

          <form onSubmit={handleSubmit} className="fs-panel">
            <span className="fs-knob" aria-hidden="true" />
            <p className="fs-eyebrow">Admin Access</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Secret"
                className="ob-input"
                style={{ textAlign: "center", fontFamily: "var(--pub-mono)", letterSpacing: "0.1em" }}
                autoFocus
              />
              {error && (
                <p style={{ fontSize: 12.5, color: "var(--danger, oklch(0.55 0.2 25))", textAlign: "center", margin: 0 }}>
                  {error}
                </p>
              )}
              <button type="submit" className="fs-cta" disabled={loading || !secret}>
                <span className="fs-cta-bar" aria-hidden="true" />
                <span className="fs-cta-label">{loading ? "Verifying…" : "Enter"}</span>
                <span className="fs-cta-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <a href={MARKETING_URL} className="fs-back-home">
            ← Back to homepage
          </a>
        </div>
      </div>
    </PublicThemeProvider>
  )
}
