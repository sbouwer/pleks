"use client"

/**
 * app/(public)/login/mfa/page.tsx — TOTP MFA challenge after password success
 *
 * Route:  /login/mfa
 * Auth:   aal1 session required (password step already done)
 * Notes:  D1 (ADDENDUM_AUTH_CONTRACT): host-scoping deleted. Uses first verified factor globally.
 *         FIX-70: passkey-aware — the stay-vs-enrol decision mirrors the resolver (verified TOTP OR an
 *         unrevoked passkey row); enrol redirects target the chooser (/settings/security/enrol), never
 *         enrol-totp; an always-on escape link recovers a dead client credential. TOTP form renders only
 *         when a verified TOTP factor exists. Post-verification hard-navigates to ?redirect= (Single-Pass).
 */

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Loader2, ShieldCheck } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { mfaVerifyNeedsEnrol, enrolChooserPath } from "@/lib/auth/mfaVerifyDecision"
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
  const [hasTotp, setHasTotp] = useState(false)
  const [passkeyOffered, setPasskeyOffered] = useState(false)   // passkey exists AND usable on this browser
  const inputRef = useRef<HTMLInputElement>(null)
  const { login: passkeyLogin, state: passkeyState, errorMsg: passkeyError, reset: passkeyReset } = usePasskeyLogin()

  // The chooser (passkey OR authenticator) — every enrol/escape route off this page targets it, never
  // the TOTP-only enrol-totp page. FIX-70: the verify page was passkey-blind and force-marched passkey
  // users into TOTP. Carries the original destination so enrolment returns the user where they meant to go.
  const enrolChooserHref = enrolChooserPath(redirectParam)

  async function handlePasskey() {
    passkeyReset()
    if (await passkeyLogin()) globalThis.location.href = safeRedirect(redirectParam)
  }

  // One bootstrap resolving BOTH factor classes — mirrors the resolver's hasVerifiedFactor predicate
  // (ADDENDUM_70 Slice A): a verified TOTP factor OR an unrevoked passkey row means "stay and verify".
  // Only when NEITHER exists do we send the user to enrolment — and to the chooser, not enrol-totp.
  useEffect(() => {
    const supabase = createClient()
    void (async () => {
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
        const totpVerified = (factors?.totp ?? []).some((f) => f.status === "verified")

        // Server-truth passkey existence drives the redirect decision — NOT browser capability. Deleting
        // a passkey from the authenticator removes only the client credential; this server row persists,
        // so a passkey-holder is routed to *verify* and must not be bounced into enrolment here.
        let passkeyExists = false
        try {
          const res = await fetch("/api/auth/passkeys/list")
          if (res.ok) {
            const { passkeys } = await res.json() as { passkeys?: unknown[] }
            passkeyExists = (passkeys?.length ?? 0) > 0
          }
        } catch { /* treat as absent */ }

        // No factor of EITHER kind → enrolment, via the chooser (passkey or authenticator).
        if (mfaVerifyNeedsEnrol({ totpVerified, passkeyExists })) {
          router.replace(enrolChooserPath(redirectParam, { mandatory: true }))
          return
        }

        // The passkey button renders only when the credential is also usable on THIS browser; a
        // passkey-only user on a non-WebAuthn browser still gets the always-on escape link below.
        const cap = await canUsePasskeys().catch(() => ({ available: false }))
        setPasskeyOffered(passkeyExists && cap.available)
        setHasTotp(totpVerified)
        setChecking(false)
        if (totpVerified) setTimeout(() => inputRef.current?.focus(), 100)
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
      router.push(enrolChooserPath(redirectParam, { mandatory: true }))
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
          {hasTotp
            ? "Finish signing in — enter the 6-digit code from your authenticator app."
            : "Finish signing in — confirm it's you with your passkey."}
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger" style={{ textAlign: "left" }}>
            {error}
          </div>
        )}

        {hasTotp && (
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
        )}

        {passkeyOffered && (
          <>
            {/* Divider only when the passkey sits under a TOTP form; passkey-only → it's the primary action. */}
            {hasTotp && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                <span className="text-xs text-muted-foreground">or</span>
                <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
              </div>
            )}
            <PasskeyButton
              onClick={handlePasskey}
              loading={passkeyState === "in_progress"}
              label={hasTotp ? "Use a passkey instead" : "Continue with a passkey"}
            />
            {/* Dead client credential (live server row, deleted from the authenticator): the button fails.
                Name it plainly and push the user at the escape link below — their only self-service way in. */}
            {passkeyState === "error" && (
              <div className="mt-2 text-xs text-danger" style={{ textAlign: "left" }}>
                {passkeyError ?? "Couldn't find that passkey on this device."} Use “Set up another way” below to enrol a fresh factor.
              </div>
            )}
          </>
        )}

        {/* Always-on self-service escape (D-FIX70-06): the only way back in for a passkey-only user whose
            credential was deleted. Emphasised after a failed passkey attempt. */}
        <div style={{ marginTop: 16 }}>
          <Link
            href={enrolChooserHref}
            className={passkeyState === "error" ? "fs-cta-ghost font-semibold text-foreground" : "fs-cta-ghost"}
          >
            Can&apos;t sign in with these? Set up another way
          </Link>
        </div>

        <div style={{ marginTop: 10 }}>
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
