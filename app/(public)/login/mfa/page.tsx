"use client"

/**
 * app/(public)/login/mfa/page.tsx — TOTP MFA challenge after password success
 *
 * Route:  /login/mfa
 * Auth:   aal1 session required (password step already done)
 * Notes:  Post-verification hard-navigates directly to ?redirect= destination (Single-Pass Doctrine).
 *         Factors are filtered by current host claim (§5.4 ADDENDUM_AUTH_RESOLVER).
 *         Wrong-host link routes to enrol-totp with cross_host=true and redirect preserved.
 */

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { Loader2, ShieldCheck } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { filterFactorsByHost, resolveCurrentHost } from "@/lib/auth/mfa-host"
import type { AllowedHost } from "@/lib/auth/mfa-host"

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
  const [wrongHostMessage, setWrongHostMessage] = useState<string | null>(null)
  const [currentHost, setCurrentHost] = useState<AllowedHost | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    // Resolve current host for factor filtering
    const host = resolveCurrentHost(new Request(globalThis.location.href)) as AllowedHost | null
    setCurrentHost(host)

    ;(async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          router.replace("/login")
          return
        }

        // Already AAL2 — skip ahead to resolver
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel === "aal2") {
          // Hard navigation — ensures the server sees the latest AAL2 cookies.
          globalThis.location.href = safeRedirect(redirectParam)
          return
        }

        // Get all verified factors, then filter by current host
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const allVerified = (factors?.totp ?? []).filter((f) => f.status === "verified")

        if (host) {
          const hostFactors = filterFactorsByHost(allVerified, host)
          if (hostFactors.length === 0 && allVerified.length > 0) {
            // Has factors on a different host — show cross-environment message
            const otherHost = allVerified[0].friendly_name?.split(" @ ")[1] ?? "another environment"
            setWrongHostMessage(
              `Your MFA codes were set up on ${otherHost}. For security, codes don't cross between environments. ` +
              `Set up MFA on this environment from Settings → Security.`
            )
            setChecking(false)
            return
          }
        }

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

    // Use host-filtered factor if available, fall back to first verified
    const hostFiltered = currentHost ? filterFactorsByHost(allVerified, currentHost) : allVerified
    const verifiedFactor = hostFiltered[0] ?? allVerified[0]

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (wrongHostMessage) {
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
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{wrongHostMessage}</p>
            <Link
              href={`/settings/security/enrol-totp?mandatory=true&cross_host=true${
                redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : ""
              }`}
              className="block text-center text-sm underline"
              style={{ color: "var(--amber-ink)" }}
            >
              Set up MFA on this environment →
            </Link>
          </CardContent>
        </Card>
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
