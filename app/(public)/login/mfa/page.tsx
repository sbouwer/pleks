"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { Loader2, ShieldCheck } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"

const BTN_PRIMARY: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "9px 18px", borderRadius: 5, fontSize: 14, fontWeight: 600,
  lineHeight: 1.5, cursor: "pointer", border: "none",
  background: "oklch(0.68 0.14 65)", color: "oklch(0.18 0.012 260)",
  transition: "background .15s, box-shadow .15s",
}

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
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login")
      } else {
        // If already aal2, skip ahead
        supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data: aal }) => {
          if (aal?.currentLevel === "aal2") {
            router.replace(redirectParam ?? "/dashboard")
          } else {
            setChecking(false)
            setTimeout(() => inputRef.current?.focus(), 100)
          }
        })
      }
    })
  }, [router, redirectParam])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors()
    if (factorsErr || !factors?.totp?.length) {
      // No TOTP enrolled — redirect to enrol
      router.push("/settings/security/enrol-totp?mandatory=true")
      return
    }

    const factor = factors.totp[0]
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeErr || !challenge) {
      setError("Could not start verification. Please try again.")
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: factor.id,
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

    // Log via server (fire and forget)
    fetch("/api/auth/log-totp-verified", { method: "POST" }).catch(() => null)

    router.push(redirectParam ?? "/dashboard")
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6)
    setCode(digits)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>
            <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center" }}>
              <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
            </Link>
          </CardTitle>
          <div className="flex justify-center mt-2">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardDescription className="mt-2">
            Enter the 6-digit code from your authenticator app to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
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
                  color: "var(--ink-base)", outline: "none",
                }}
              />
            </div>
            <button
              type="submit"
              style={{ ...BTN_PRIMARY, opacity: code.length < 6 ? 0.6 : 1 }}
              disabled={loading || code.length < 6}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different account
            </Link>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Lost access to your authenticator?{" "}
            <a href="mailto:security@pleks.co.za" className="hover:underline">
              Contact support
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
