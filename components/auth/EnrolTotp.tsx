"use client"

/**
 * components/auth/EnrolTotp.tsx — TOTP MFA enrolment wizard, shared between Welcome and Settings
 *
 * Notes:  Logic preserved verbatim from app/(dashboard)/settings/security/enrol-totp/page.tsx.
 *         variant="welcome" → focused shell, "Continue" terminal copy, redirects to redirectTo.
 *         variant="settings" → dashboard shell, "Go to dashboard" terminal copy.
 *         Props supply redirectTo/mandatory — component reads nothing from the URL itself.
 *         Tokens: all via CSS vars (--ink/--amber/--paper-sunk etc.), no raw hex.
 */

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { isPreviewHost } from "@/lib/auth/mfa-host"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react"

export interface EnrolTotpProps {
  redirectTo?: string
  mandatory?: boolean
  variant?: "settings" | "welcome"
  /** Embedded mode: render chrome-less (no et-wrap/et-card, no header) so it sits
   *  inside the welcome door panel. Pair with onVerified to keep the flow in-page. */
  embedded?: boolean
  /** Called after the primary factor is verified. When provided, EnrolTotp does NOT
   *  advance to the backup screen or redirect — the host (welcome flow) takes over. */
  onVerified?: () => void
}

type Phase = "enrol1" | "backup" | "enrol2" | "done"

export function EnrolTotp({ redirectTo, mandatory = false, variant = "settings", embedded = false, onVerified }: Readonly<EnrolTotpProps>) {
  const router = useRouter()
  const safeNext = redirectTo ? safeRedirect(redirectTo) : "/dashboard"
  const fallbackSelf = "/settings/security/enrol-totp"

  const [phase, setPhase] = useState<Phase>("enrol1")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCode1, setQrCode1] = useState<string | null>(null)
  const [secret1, setSecret1] = useState<string | null>(null)
  const [factorId1, setFactorId1] = useState<string | null>(null)
  const [qrCode2, setQrCode2] = useState<string | null>(null)
  const [secret2, setSecret2] = useState<string | null>(null)
  const [factorId2, setFactorId2] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const req = new Request(globalThis.location.href)

    if (isPreviewHost(req)) {
      setError("TOTP setup is disabled on preview deploys. Use the production or staging environment.")
      return
    }

    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(async ({ data: factors }) => {
      const allVerified = (factors?.totp ?? []).filter(f => f.status === "verified")

      if (allVerified.length > 0) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel !== "aal2") {
          const returnTo = redirectTo ? safeRedirect(redirectTo) : fallbackSelf
          router.replace(`/login/mfa?redirect=${encodeURIComponent(returnTo)}`)
          return
        }
        // AAL2 + verified factor — user is adding a backup
        setPhase("enrol2")
      }

      const verifiedCount = allVerified.length

      // Clear any leftover unverified TOTP factors from previous incomplete attempts.
      const unverified = (factors?.totp ?? []).filter(f => f.status !== "verified")
      for (const stale of unverified) {
        const { error: unenrolErr } = await supabase.auth.mfa.unenroll({ factorId: stale.id })
        if (unenrolErr) {
          console.error("[enrol-totp] failed to clear unverified factor", stale.id, unenrolErr)
        }
      }

      const label = verifiedCount === 0 ? "Primary device" : `Backup device ${verifiedCount}`

      setLoading(true)
      setError(null)
      const { data, error: enrolErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Pleks",
        friendlyName: label,
      })
      setLoading(false)
      if (enrolErr || !data) {
        console.error("[enrol-totp] mfa.enroll failed", enrolErr)
        setError(enrolErr?.message ?? "Enrolment failed. Open DevTools console for details.")
        return
      }
      if (verifiedCount === 0) {
        setQrCode1(data.totp.qr_code)
        setSecret1(data.totp.secret)
        setFactorId1(data.id)
      } else {
        setQrCode2(data.totp.qr_code)
        setSecret2(data.totp.secret)
        setFactorId2(data.id)
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }).catch((err) => {
      console.error("[enrol-totp] listFactors / setup chain threw", err)
      setLoading(false)
      setError("Something went wrong starting MFA setup. Open DevTools console for details.")
    })
  }, [router, redirectTo, fallbackSelf])

  async function enrolFactor(factorNum: 1 | 2) {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const label = factorNum === 1 ? "Primary device" : "Backup device"
    const { data, error: enrolErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Pleks",
      friendlyName: label,
    })
    setLoading(false)
    if (enrolErr || !data) {
      setError(enrolErr?.message ?? "Enrolment failed")
      return
    }
    if (factorNum === 1) {
      setQrCode1(data.totp.qr_code)
      setSecret1(data.totp.secret)
      setFactorId1(data.id)
    } else {
      setQrCode2(data.totp.qr_code)
      setSecret2(data.totp.secret)
      setFactorId2(data.id)
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function verifyFactor(factorNum: 1 | 2) {
    const factorId = factorNum === 1 ? factorId1 : factorId2
    if (!factorId || code.length !== 6) return
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr || !challenge) {
      setError("Could not start verification")
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    })

    setLoading(false)
    if (verifyErr) {
      setError("Incorrect code. Please check your authenticator and try again.")
      setCode("")
      inputRef.current?.focus()
      return
    }

    await fetch("/api/auth/log-totp-enrolled", { method: "POST" }).catch(() => null)
    setCode("")
    // Embedded welcome flow: hand control back to the host (→ secured animation),
    // skip the backup screen and the router.refresh (resolver re-reads AAL on finish).
    if (factorNum === 1 && onVerified) {
      onVerified()
      return
    }
    router.refresh()
    if (factorNum === 1) {
      setPhase("backup")
    } else {
      setPhase("done")
    }
  }

  // Context-aware terminal copy — variant drives "Continue" vs "Go to dashboard"
  const continueLabel = variant === "welcome" ? "Continue" : "Go to dashboard"
  const savedContinueLabel = variant === "welcome" ? "I’ve saved it — continue" : "I’ve saved it — go to dashboard"

  if (phase === "done") {
    return (
      <div className="et-done">
        <div className="et-done-icon">
          <CheckCircle2 size={48} color="var(--amber)" aria-hidden="true" />
        </div>
        <p className="et-done-title">You&apos;re protected</p>
        <p className="et-done-desc">
          Two-factor authentication is active on your account.
        </p>
        <ActionButton tone="primary" onClick={() => { globalThis.location.href = safeNext }}>
          {continueLabel}
        </ActionButton>
      </div>
    )
  }

  if (phase === "backup") {
    return (
      <div className="et-wrap">
        <div className="et-card">
          <div className="et-header">
            <div className="et-icon">
              <CheckCircle2 size={32} color="var(--amber)" aria-hidden="true" />
            </div>
            <p className="et-title">Authenticator verified</p>
            <p className="et-desc">
              Save your backup secret so you can recover access if you ever lose your phone.
            </p>
          </div>

          <div className="et-secret" style={{ marginBottom: 16 }}>
            <span className="et-label">Backup secret — save in your password manager</span>
            <p className="et-secret-text">{secret1}</p>
          </div>

          <p style={{ fontFamily: "var(--pub-sans)", fontSize: 13, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 20px" }}>
            This is the same secret encoded in the QR code. Anyone with it can recreate your MFA factor,
            so treat it like a password. If you use 1Password, Bitwarden, or iCloud Keychain, your
            authenticator entries are already synced across your devices — you may not need this at all.
          </p>

          <div className="et-actions">
            <ActionButton tone="primary" onClick={() => { globalThis.location.href = safeNext }}>
              {savedContinueLabel}
            </ActionButton>
            <ActionButton
              tone="secondary"
              onClick={() => { setPhase("enrol2"); void enrolFactor(2) }}
            >
              Add a second authenticator entry instead
            </ActionButton>
          </div>
        </div>
      </div>
    )
  }

  const qrCode = phase === "enrol1" ? qrCode1 : qrCode2
  const secret = phase === "enrol1" ? secret1 : secret2
  const factorNum: 1 | 2 = phase === "enrol1" ? 1 : 2

  let cardDescription: string
  if (phase === "enrol2") {
    cardDescription = "Add a second authenticator entry as an extra backup."
  } else if (mandatory) {
    cardDescription = "Your account requires two-factor authentication before accessing the dashboard."
  } else {
    cardDescription = "Protect your account with an authenticator app."
  }

  // Embedded (welcome) layout — matches the welcome brief: QR left, code right,
  // mono eyebrows, sunk secret box, 6 underline cells, amber-bar "Confirm" CTA.
  if (embedded) {
    return (
      <div className="et-embedded">
        {loading && !qrCode && (
          <div className="et-embed-loading">
            <Loader2 className="animate-spin" size={22} color="var(--ink-mute)" aria-label="Loading" />
          </div>
        )}
        {qrCode && (
          <>
            <div className="et-embed-grid">
              <div className="et-embed-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="TOTP QR code" width={138} height={138} />
                <span className="et-embed-qr-knob" aria-hidden="true" />
              </div>
              <div className="et-embed-right">
                {secret && (
                  <div className="et-embed-field">
                    <span className="et-embed-eyebrow">Or type this code</span>
                    <p className="et-embed-secret">{secret}</p>
                  </div>
                )}
                <div className="et-embed-field">
                  <span className="et-embed-eyebrow">Verification code</span>
                  <button type="button" className="et-embed-codewrap" onClick={() => inputRef.current?.focus()} aria-label="Enter verification code">
                    <input
                      ref={inputRef}
                      className="et-embed-codeinput"
                      type="text" inputMode="numeric" autoComplete="one-time-code"
                      maxLength={6} value={code}
                      onChange={(e) => setCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
                      disabled={loading}
                      aria-label="6-digit verification code"
                    />
                    <span className="et-embed-cells" aria-hidden="true">
                      {Array.from({ length: 6 }).map((_, i) => {
                        let cls = "et-embed-cell"
                        if (code[i]) cls += " et-embed-cell--filled"
                        else if (i === code.length) cls += " et-embed-cell--active"
                        return <span key={`cell-${i}`} className={cls}>{code[i] ?? ""}</span>
                      })}
                    </span>
                  </button>
                  <span className="et-embed-refresh">Code refreshes every 30 seconds</span>
                </div>
              </div>
            </div>

            {error && <div className="et-error" style={{ margin: "0 0 16px" }}>{error}</div>}

            <button type="button" className="ob-cta" disabled={code.length < 6 || loading} onClick={() => void verifyFactor(factorNum)}>
              <span className="ob-cta-bar" aria-hidden="true" />
              <span className="ob-cta-label">{loading ? "Verifying…" : "Confirm and continue"}</span>
              <span className="ob-cta-arrow" aria-hidden="true">→</span>
            </button>
          </>
        )}
      </div>
    )
  }

  const body = (
    <>
        {!embedded && (
          <div className="et-header">
            <div className="et-icon">
              <ShieldCheck size={32} color="var(--ink-mute)" aria-hidden="true" />
            </div>
            <p className="et-title">Set up two-factor authentication</p>
            <p className="et-desc">{cardDescription}</p>
          </div>
        )}

        {phase === "enrol2" && (
          <p className="et-badge">Optional — Backup authenticator entry</p>
        )}

        {loading && !qrCode && (
          <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
            <Loader2 className="animate-spin" size={24} color="var(--ink-mute)" aria-label="Loading" />
          </div>
        )}

        {qrCode && (
          <>
            <p style={{ fontFamily: "var(--pub-sans)", fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px" }}>
              Scan this QR code with{" "}
              <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Google Authenticator, Authy, 1Password, or Bitwarden</strong>:
            </p>
            <div style={{ display: "flex", justifyContent: "center", margin: "0 0 16px" }}>
              {/* QR code is a data: URI from Supabase */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="TOTP QR code" width={180} height={180} />
            </div>
            {secret && (
              <div className="et-secret" style={{ marginBottom: 16 }}>
                <span className="et-label">Or enter manually</span>
                <p className="et-secret-text">{secret}</p>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <Label htmlFor="totp-code" style={{ fontFamily: "var(--pub-sans)", fontSize: 13, color: "var(--ink)" }}>
                6-digit code from your app
              </Label>
              <Input
                id="totp-code"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
                disabled={loading}
                style={{ marginTop: 6 }}
              />
            </div>

            {error && <div className="et-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div className="et-actions">
              <ActionButton
                tone="primary"
                disabled={code.length < 6 || loading}
                onClick={() => void verifyFactor(factorNum)}
                style={{ opacity: code.length < 6 || loading ? 0.6 : 1 }}
              >
                {loading && <Loader2 className="animate-spin" size={16} aria-hidden="true" />}
                {phase === "enrol2" ? "Verify and finish" : "Verify"}
              </ActionButton>

              {phase === "enrol2" && (
                <ActionButton
                  tone="secondary"
                  onClick={() => {
                    if (factorId2) {
                      createClient().auth.mfa.unenroll({ factorId: factorId2 }).catch(() => null)
                    }
                    setPhase("done")
                  }}
                >
                  Skip — the backup secret is enough
                </ActionButton>
              )}
            </div>
          </>
        )}
    </>
  )

  return (
    <div className="et-wrap">
      <div className="et-card">{body}</div>
    </div>
  )
}
