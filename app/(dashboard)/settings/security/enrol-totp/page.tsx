"use client"

/**
 * app/(dashboard)/settings/security/enrol-totp/page.tsx — TOTP MFA enrolment wizard (primary + backup)
 *
 * Route:  /settings/security/enrol-totp
 * Auth:   Authenticated; AAL2 required when user already has a verified factor (adding backup)
 * Notes:  Encodes host in factor friendly_name (S-40, ADDENDUM_AUTH_RESOLVER §5.4).
 *         Refuses enrolment on *.vercel.app preview deploys — no stable host = no factor.
 */

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { buildFactorFriendlyName, resolveCurrentHost, isPreviewHost } from "@/lib/auth/mfa-host"
import type { AllowedHost } from "@/lib/auth/mfa-host"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react"

const BTN_PRIMARY: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "9px 18px", borderRadius: 5, fontSize: 14, fontWeight: 600,
  lineHeight: 1.5, cursor: "pointer", border: "none",
  background: "oklch(0.68 0.14 65)", color: "oklch(0.18 0.012 260)",
  transition: "background .15s",
}
const BTN_GHOST: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "9px 18px", borderRadius: 5, fontSize: 14, fontWeight: 600,
  lineHeight: 1.5, cursor: "pointer", border: "1px solid oklch(0.78 0.008 85)",
  background: "transparent", color: "inherit", transition: "background .15s",
}

export default function EnrolTotpPage() {
  return (
    <Suspense>
      <EnrolTotpContent />
    </Suspense>
  )
}

type Phase = "enrol1" | "backup" | "enrol2" | "done"

function EnrolTotpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mandatory = searchParams.get("mandatory") === "true"

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
  const currentHostRef = useRef<AllowedHost | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const req = new Request(globalThis.location.href)

    if (isPreviewHost(req)) {
      setError("TOTP setup is disabled on preview deploys. Use the production or staging environment.")
      return
    }

    currentHostRef.current = resolveCurrentHost(req)

    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(async ({ data: factors }) => {
      const verifiedTotps = (factors?.totp ?? []).filter(f => f.status === "verified")
      const verifiedCount = verifiedTotps.length

      if (verifiedCount > 0) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel !== "aal2") {
          router.replace(`/login/mfa?redirect=${encodeURIComponent("/settings/security/enrol-totp")}`)
          return
        }
        // AAL2 + already enrolled — user is adding a backup factor
        setPhase("enrol2")
      }

      // Clear any leftover unverified TOTP factors from previous incomplete attempts.
      const unverified = (factors?.totp ?? []).filter(f => f.status !== "verified")
      for (const stale of unverified) {
        const { error: unenrolErr } = await supabase.auth.mfa.unenroll({ factorId: stale.id })
        if (unenrolErr) {
          console.error("[enrol-totp] failed to clear unverified factor", stale.id, unenrolErr)
        }
      }

      // Embed host in friendly_name so filterFactorsByHost() scopes verification correctly.
      const label = verifiedCount === 0 ? "Primary device" : `Backup device ${verifiedCount}`
      const h = currentHostRef.current
      const friendlyName = h ? buildFactorFriendlyName(label, h) : label

      setLoading(true)
      setError(null)
      const { data, error: enrolErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Pleks",
        friendlyName,
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
  }, [router])

  async function enrolFactor(factorNum: 1 | 2) {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const label = factorNum === 1 ? "Primary device" : "Backup device"
    const h = currentHostRef.current
    const { data, error: enrolErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Pleks",
      friendlyName: h ? buildFactorFriendlyName(label, h) : label,
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

    fetch("/api/auth/log-totp-enrolled", { method: "POST" }).catch(() => null)
    setCode("")
    if (factorNum === 1) {
      setPhase("backup")
    } else {
      setPhase("done")
    }
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-16">
        <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
        <h1 className="font-heading text-2xl mb-2">You&apos;re protected</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Two-factor authentication is active on your account.
        </p>
        <button style={BTN_PRIMARY} onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </button>
      </div>
    )
  }

  if (phase === "backup") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Authenticator verified</CardTitle>
            <CardDescription>
              Save your backup secret so you can recover access if you ever lose your phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-rule bg-surface-raised p-4 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Backup secret — save this in your password manager
              </p>
              <p className="font-mono text-sm break-all select-all text-center">{secret1}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the same secret encoded in the QR code. Anyone with it can recreate your MFA factor,
              so treat it like a password. If you use 1Password, Bitwarden, or iCloud Keychain, your
              authenticator entries are already synced across your devices — you may not need this at all.
            </p>
            <div className="flex flex-col gap-2">
              <button style={BTN_PRIMARY} onClick={() => router.push("/dashboard")}>
                I&apos;ve saved it — go to dashboard
              </button>
              <button
                style={BTN_GHOST}
                onClick={() => { setPhase("enrol2"); void enrolFactor(2) }}
              >
                Add a second authenticator entry instead
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const qrCode = phase === "enrol1" ? qrCode1 : qrCode2
  const secret = phase === "enrol1" ? secret1 : secret2
  const factorNum: 1 | 2 = phase === "enrol1" ? 1 : 2

  let cardDescription = mandatory
    ? "Your account requires two-factor authentication before accessing the dashboard."
    : "Protect your account with an authenticator app."
  if (phase === "enrol2") cardDescription = "Add a second authenticator entry as an extra backup."

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Set up two-factor authentication</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {phase === "enrol2" && (
            <div className="text-sm font-medium text-muted-foreground">
              Optional — Backup authenticator entry
            </div>
          )}

          {loading && !qrCode && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {qrCode && (
            <>
              <p className="text-sm">
                Scan this QR code with{" "}
                <strong>Google Authenticator, Authy, 1Password, or Bitwarden</strong>:
              </p>
              <div className="flex justify-center">
                {/* QR code is a data: URI from Supabase */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="TOTP QR code" width={180} height={180} />
              </div>
              {secret && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Or enter manually:</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded break-all">{secret}</code>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="totp-code">6-digit code from your app</Label>
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
                />
              </div>

              {error && (
                <div className="rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  style={{ ...BTN_PRIMARY, opacity: code.length < 6 || loading ? 0.6 : 1 }}
                  disabled={code.length < 6 || loading}
                  onClick={() => void verifyFactor(factorNum)}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {phase === "enrol2" ? "Verify and finish" : "Verify"}
                </button>

                {phase === "enrol2" && (
                  <button
                    style={BTN_GHOST}
                    onClick={() => {
                      if (factorId2) {
                        createClient().auth.mfa.unenroll({ factorId: factorId2 }).catch(() => null)
                      }
                      setPhase("done")
                    }}
                  >
                    Skip — the backup secret is enough
                  </button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
