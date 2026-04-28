"use client"

import { useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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

function EnrolTotpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mandatory = searchParams.get("mandatory") === "true"

  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCode1, setQrCode1] = useState<string | null>(null)
  const [secret1, setSecret1] = useState<string | null>(null)
  const [factorId1, setFactorId1] = useState<string | null>(null)
  const [qrCode2, setQrCode2] = useState<string | null>(null)
  const [secret2, setSecret2] = useState<string | null>(null)
  const [factorId2, setFactorId2] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [done, setDone] = useState(false)
  const [singleDeviceMode, setSingleDeviceMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function enrolFactor(factorNum: 1 | 2) {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: enrolErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: factorNum === 1 ? "Primary device" : "Backup device",
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

    // Log enrolment
    fetch("/api/auth/log-totp-enrolled", { method: "POST" }).catch(() => null)

    setCode("")
    if (factorNum === 1 && !singleDeviceMode) {
      setStep(2)
      enrolFactor(2)
    } else {
      // Done — clear mfa_recovery_pending flag if both factors enrolled
      if (!singleDeviceMode) {
        fetch("/api/auth/clear-mfa-recovery", { method: "POST" }).catch(() => null)
      }
      setDone(true)
    }
  }

  async function handleSingleDevice() {
    setSingleDeviceMode(true)
    // Flag account as mfa_recovery_pending
    fetch("/api/auth/set-mfa-recovery", { method: "POST" }).catch(() => null)
    await verifyFactor(1)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-16">
        <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
        <h1 className="font-heading text-2xl mb-2">You&apos;re protected</h1>
        <p className="text-muted-foreground text-sm mb-8">
          {singleDeviceMode
            ? "One authenticator enrolled. Add a second device from Security settings when you can."
            : "Two authenticator devices enrolled successfully."}
        </p>
        <button style={BTN_PRIMARY} onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </button>
      </div>
    )
  }

  const qrCode = step === 1 ? qrCode1 : qrCode2
  const secret = step === 1 ? secret1 : secret2

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Set up two-factor authentication</CardTitle>
          <CardDescription>
            {mandatory
              ? "Your account requires two authenticator devices before accessing the dashboard."
              : "Protect your account with an authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-sm font-medium text-muted-foreground">
            Step {step} of 2 — {step === 1 ? "Primary device" : "Backup device"}
          </div>

          {loading && !qrCode && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {qrCode && (
            <>
              <p className="text-sm">
                Scan this QR code with{" "}
                <strong>Google Authenticator, Authy, or 1Password</strong>:
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
                  onClick={() => verifyFactor(step)}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {step === 1 ? "Verify and continue to step 2" : "Finish setup"}
                </button>

                {step === 1 && (
                  <button
                    style={BTN_GHOST}
                    disabled={loading || code.length < 6}
                    onClick={handleSingleDevice}
                  >
                    I only have one device right now
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
