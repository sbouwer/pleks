"use client"

/**
 * app/(onboarding)/onboarding/severed/page.tsx — access-ended landing for ex-members
 *
 * Route:  /onboarding/severed
 * Auth:   authenticated (manifest: skipOrgCheck — no org membership expected)
 * Notes:  Shown by /auth/resolver when onboarding_state='complete' but the user has
 *         no active membership. Resolver reaches here after a user is removed from
 *         their organisation. Sign-out posts to /api/auth/logout to clear httpOnly cookies.
 */
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export default function SeveredPage() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => null)
  }, [])

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
    globalThis.location.href = "/"
  }

  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <p style={{ fontSize: 40, margin: "0 0 16px" }}>&#x1F512;</p>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 10px" }}>
        Your access has ended
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: "0 0 8px" }}>
        You are no longer a member of any organisation on Pleks.
      </p>
      {email && (
        <p style={{ color: "var(--ink-mute)", fontSize: 13, margin: "0 0 32px" }}>
          {email}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 280, margin: "0 auto" }}>
        <Link
          href="/contact"
          style={{
            display: "block", padding: "10px 20px", borderRadius: "var(--r-md)",
            border: "1px solid var(--rule)", fontSize: 14, color: "var(--ink)",
            textDecoration: "none",
          }}
        >
          Contact support
        </Link>
        <button
          type="button"
          onClick={() => { void handleSignOut() }}
          style={{
            width: "100%", padding: "10px 20px", borderRadius: "var(--r-md)",
            background: "none", border: "1px solid var(--critical)", fontSize: 14,
            color: "var(--critical)", cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
