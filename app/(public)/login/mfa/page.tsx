"use client"

/**
 * app/(public)/login/mfa/page.tsx — TOTP MFA challenge after password success
 *
 * Route:  /login/mfa
 * Auth:   aal1 session required (password step already done)
 * Notes:  D1 (ADDENDUM_AUTH_CONTRACT): host-scoping deleted. Uses first verified factor globally.
 *         Post-verification hard-navigates directly to ?redirect= destination (Single-Pass Doctrine).
 */

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Loader2, ShieldCheck } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { FocusShell } from "@/components/layout/FocusShell"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

export default function MfaPage() {
  return (
    <Suspense>
      <MfaContent />
    </Suspense>
  )
}

function MfaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")

  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()

    ;(async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          router.replace("/login")
          return
        }

        // Already AAL2 — skip ahead to destination
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel === "aal2") {
          globalThis.location.href = safeRedirect(redirectParam)
          return
        }

        const { data: factors } = await supabase.auth.mfa.listFactors()
        const allVerified = (factors?.totp ?? []).filter((f) => f.status === "verified")

        if (allVerified.length === 0) {
          router.replace("/settings/security/enrol-totp?mandatory=true")
          return
        }

        setChecking(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      } catch (err) {
        console.error("[mfa] setup check failed", err)
        setError("Couldn't load your MFA settings. Please refresh the page or contact support@pleks.co.za.")
        setChecking(false)
      }
    })()
  }, [router, redirectParam])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors()
    const allVerified = (factors?.totp ?? []).filter((f) => f.status === "verified")
    const verifiedFactor = allVerified[0]

    if (factorsErr || !verifiedFactor) {
      router.push("/settings/security/enrol-totp?mandatory=true")
      return
    }

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id })
    if (challengeErr || !challenge) {
      setError("Could not start verification. Please try again.")
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: verifiedFactor.id,
      challengeId: challenge.id,
      code,
    })

    if (verifyErr) {
      setError("Incorrect code. Please try again.")
      setCode("")
      inputRef.current?.focus()
      setLoading(false)
      return
    }

    await fetch("/api/auth/log-totp-verified", { method: "POST" }).catch(() => null)

    // Hard navigation — eliminates the AAL1→AAL2 cookie propagation race (see 1A).
    globalThis.location.href = safeRedirect(redirectParam)
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6)
    setCode(digits)
  }

  if (checking) {
    return (
      <FocusShell>
        <div className="fs-panel" style={{ maxWidth: 400, textAlign: "center" }} role="status" aria-busy="true">
          <span className="fs-knob" aria-hidden="true" />
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" style={{ margin: "0 auto" }} />
          <span className="sr-only">Checking your session</span>
        </div>
      </FocusShell>
    )
  }

  return (
    <FocusShell>
      <div className="fs-panel" style={{ maxWidth: 400, textAlign: "center" }}>
        <span className="fs-knob" aria-hidden="true" />
        <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center", fontSize: 22 }}>
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
        </a>
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 2px" }}>
          <ShieldCheck className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="fs-subhead" style={{ margin: "0 0 20px" }}>
          Finish signing in — enter the 6-digit code from your authenticator app.
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger" style={{ textAlign: "left" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            disabled={loading}
            maxLength={6}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 6,
              border: "1px solid var(--rule)", background: "var(--surface-raised)",
              fontSize: 24, fontWeight: 600, textAlign: "center", letterSpacing: "0.3em",
              color: "var(--ink-base)", outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            className="fs-cta"
            disabled={loading || code.length < 6}
            style={{ opacity: code.length < 6 ? 0.6 : 1 }}
          >
            <span className="fs-cta-bar" aria-hidden="true" />
            <span className="fs-cta-label">{loading ? "Verifying…" : "Verify"}</span>
            <span className="fs-cta-arrow" aria-hidden="true">→</span>
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          <Link href="/login" className="fs-cta-ghost">Use a different account</Link>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Lost access to your authenticator?{" "}
          <a href="mailto:security@pleks.co.za" className="hover:underline">Contact support</a>
        </p>
      </div>
    </FocusShell>
  )
}
