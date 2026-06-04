/**
 * components/consent/ConsentCodeEntry.tsx — SMS verification code entry UI
 *
 * Auth:   Public — called after /api/consent/send-code succeeds
 * Notes:  ADDENDUM_14F. Shared between applicant invite consent and director portal
 *         consent. Handles send → entry → verify loop. Resend with countdown timer.
 *         Calls /api/consent/verify-code; on success calls onVerified(verificationId).
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Card, CardContent } from "@/components/ui/card"
import { Smartphone, RotateCcw, CheckCircle2 } from "lucide-react"

interface Props {
  verificationId: string
  targetMasked: string
  expiresAt: string
  onVerified: (verificationId: string) => void
  onResend: () => Promise<{ verificationId: string; targetMasked: string; expiresAt: string } | { error: string }>
  label?: string
}

function resendButtonLabel(cooldown: number, sending: boolean): string {
  if (cooldown > 0) return `Resend in ${cooldown}s`
  return sending ? "Sending…" : "Resend code"
}

export function ConsentCodeEntry({
  verificationId: initialVerificationId,
  targetMasked,
  expiresAt: initialExpiresAt,
  onVerified,
  onResend,
  label,
}: Readonly<Props>) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState(3)
  const [currentVerifId, setCurrentVerifId] = useState(initialVerificationId)
  const [currentExpiry, setCurrentExpiry] = useState(new Date(initialExpiresAt))
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(30)

  // Countdown timer
  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((currentExpiry.getTime() - Date.now()) / 1000)))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [currentExpiry])

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const handleVerify = useCallback(async () => {
    const trimmed = code.trim().replace(/\D/g, "")
    if (trimmed.length !== 6) {
      setError("Enter the 6-digit code")
      return
    }
    setLoading(true)
    setError(null)

    const res = await fetch("/api/consent/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: currentVerifId, code: trimmed }),
    })
    const json = await res.json() as {
      status?: string
      attemptsRemaining?: number
      message?: string
      error?: string
    }
    setLoading(false)

    if (json.status === "verified" || json.status === "already_verified") {
      setVerified(true)
      onVerified(currentVerifId)
      return
    }
    if (json.status === "expired") {
      setError("Code expired — please request a new one")
      return
    }
    if (json.status === "locked") {
      setError(json.message ?? "Code invalidated — request a new one")
      return
    }
    if (json.status === "invalid") {
      const remaining = json.attemptsRemaining ?? attemptsRemaining - 1
      setAttemptsRemaining(remaining)
      setError(`Incorrect code — ${remaining} attempt${remaining === 1 ? "" : "s"} remaining`)
      return
    }
    setError(json.error ?? "Verification failed. Try again.")
  }, [code, currentVerifId, onVerified, attemptsRemaining])

  const handleResend = useCallback(async () => {
    setResending(true)
    setError(null)
    setCode("")
    const result = await onResend()
    setResending(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    setCurrentVerifId(result.verificationId)
    setCurrentExpiry(new Date(result.expiresAt))
    setAttemptsRemaining(3)
    setResendCooldown(30)
  }, [onResend])

  if (verified) {
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-4 flex items-center gap-3">
          <CheckCircle2 className="size-5 text-green-500 shrink-0" />
          <p className="text-sm font-medium">{label ?? "Consent"} verified</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Enter the 6-digit code</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sent to {targetMasked}
              {secondsLeft > 0 && ` — expires in ${secondsLeft}s`}
              {secondsLeft === 0 && " — code expired"}
            </p>
          </div>
        </div>

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") void handleVerify() }}
          className="w-full h-12 text-center text-xl font-mono tracking-[0.4em] rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading || secondsLeft === 0}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <ActionButton
          tone="primary"
          className="w-full"
          disabled={loading || code.length !== 6 || secondsLeft === 0}
          onClick={() => void handleVerify()}
        >
          {loading ? "Verifying…" : "Verify code"}
        </ActionButton>

        <div className="flex justify-center">
          <button
            type="button"
            disabled={resending || resendCooldown > 0}
            onClick={() => void handleResend()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="size-3" />
            {resendButtonLabel(resendCooldown, resending)}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
