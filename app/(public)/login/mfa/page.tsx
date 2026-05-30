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
import { usePasskeyLogin } from "@/lib/auth/passkeys/usePasskeyLogin"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { OtpCodeInput } from "@/components/auth/OtpCodeInput"
import { PasskeyButton } from "@/components/auth/PasskeyButton"

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
  const [passkeyOffered, setPasskeyOffered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { login: passkeyLogin, state: passkeyState, errorMsg: passkeyError, reset: passkeyReset } = usePasskeyLogin()

  // Lost-authenticator recovery (ADDENDUM_69 Slice C): if the user has a passkey, offer it as
  // an escape hatch right here — a passkey logs them in at AAL2 (Slice A), bypassing the TOTP
  // they can't produce. Shown only when WebAuthn is available AND they have an enrolled passkey.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const cap = await canUsePasskeys()
        if (!cap.available) return
        const res = await fetch("/api/auth/passkeys/list")
        if (!res.ok) return
        const { passkeys } = await res.json() as { passkeys?: unknown[] }
        if (active && (passkeys?.length ?? 0) > 0) setPasskeyOffered(true)
      } catch { /* passkey just stays hidden */ }
    })()
    return () => { active = false }
  }, [])

  async function handlePasskey() {
    passkeyReset()
    if (await passkeyLogin()) globalThis.location.href = safeRedirect(redirectParam)
  }

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
          <OtpCodeInput value={code} onChange={setCode} disabled={loading} inputRef={inputRef} />
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

        {passkeyOffered && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
              <span className="text-xs text-muted-foreground">or</span>
              <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
            </div>
            {passkeyError && <div className="mb-2 text-xs text-danger">{passkeyError}</div>}
            <PasskeyButton
              onClick={handlePasskey}
              loading={passkeyState === "in_progress"}
              label="Use a passkey instead"
            />
          </>
        )}

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
