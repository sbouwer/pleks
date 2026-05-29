"use client"

/**
 * app/(public)/login/page.tsx — Email + password login with passkey conditional UI
 *
 * Route:  /login
 * Auth:   unauthenticated (redirects to /auth/resolver if already logged in)
 * Notes:  ?redirect= is sanitised via safeRedirect() to block open-redirect.
 *         Post-login routing is delegated entirely to /auth/resolver (I-1 invariant).
 *         email_exists check before sign-in failure enables S-02 UX flow.
 */

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { Eye, EyeOff, KeyRound, Loader2, Info } from "lucide-react"
import { usePasskeyLogin } from "@/lib/auth/passkeys/usePasskeyLogin"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { safeRedirect } from "@/lib/auth/safe-redirect"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

function getButtonLabel(isMagicLink: boolean, isLoading: boolean) {
  if (isMagicLink) return isLoading ? "Sending link..." : "Send login link"
  return isLoading ? "Signing in..." : "Sign in"
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

const BTN_PRIMARY: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "9px 18px", borderRadius: 5, fontSize: 14, fontWeight: 600,
  lineHeight: 1.5, cursor: "pointer", border: "none",
  background: "oklch(0.68 0.14 65)", color: "oklch(0.18 0.012 260)",
  transition: "background .15s, box-shadow .15s",
}
const BTN_GHOST: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "9px 18px", borderRadius: 5, fontSize: 14, fontWeight: 600,
  lineHeight: 1.5, cursor: "pointer", border: "1px solid oklch(0.78 0.008 85)",
  background: "transparent", color: "oklch(0.18 0.012 260)",
  transition: "background .15s, border-color .15s, color .15s",
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")
  const emailParam = searchParams.get("email")

  const [email, setEmail] = useState(emailParam ?? "")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkMode, setMagicLinkMode] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [checking, setChecking] = useState(true)
  const [passkeyAvailable, setPasskeyAvailable] = useState(false)
  const [emailNotFound, setEmailNotFound] = useState(false)
  const { login: passkeyLogin, state: passkeyState, errorMsg: passkeyError, reset: passkeyReset } = usePasskeyLogin()

  // Capability detection
  useEffect(() => {
    canUsePasskeys().then(c => setPasskeyAvailable(c.available))
  }, [])

  // Build the resolver URL (with optional redirect param) for post-auth routing
  function resolverUrl(extra?: string) {
    const base = "/auth/resolver"
    const params = new URLSearchParams()
    const safe = redirectParam ? safeRedirect(redirectParam) : null
    if (safe && safe !== "/") params.set("redirect", safe)
    if (extra) params.set(extra, "1")
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  // If already authenticated, send to resolver — no role decision here (I-1)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace(resolverUrl())
        } else {
          setChecking(false)
        }
      })
      .catch(() => { setChecking(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogin(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setEmailNotFound(false)
    setLoading(true)

    const supabase = createClient()

    if (magicLinkMode) {
      // Pass the raw destination as next= so /auth/callback doesn't double-wrap resolverUrl()
      const safeNext = redirectParam ? safeRedirect(redirectParam) : "/"
      const nextParam = safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : ""
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${globalThis.location.origin}/auth/callback${nextParam}`,
        },
      })
      if (otpError) {
        setError(otpError.message)
      } else {
        setMagicLinkSent(true)
      }
      setLoading(false)
      return
    }

    // email_exists check before attempting password sign-in (S-02 flow).
    // Accepted trade-off: leaks one bit of existence info to enable first-impression UX.
    // Mitigated by rate-limiting on /api/auth/check-email (D-AUTH-RESOLVER-09).
    const checkRes = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null)
    const emailExists = checkRes?.ok ? (await checkRes.json().catch(() => ({ exists: true }))).exists : true

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      if (!emailExists) {
        setEmailNotFound(true)
      } else {
        setError("Incorrect email or password")
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(resolverUrl())
      return
    }

    // MFA check — if elevation required, route through /login/mfa which re-fires resolver
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.nextLevel === "aal2" && aalData?.currentLevel === "aal1") {
      const dest = `/login/mfa?redirect=${encodeURIComponent(resolverUrl())}`
      router.push(dest)
      return
    }

    // AAL satisfied — resolver decides destination
    router.push(resolverUrl())
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (magicLinkSent) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>
              <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </a>
            </CardTitle>
            <CardDescription>Check your email for a login link.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              We sent a link to <strong>{email}</strong>
            </p>
            <button
              id="pleks-login-back"
              type="button"
              style={BTN_GHOST}
              onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false) }}
            >
              Back to login
            </button>
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
              <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </a>
            </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {emailNotFound && (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm flex gap-2">
              <Info size={14} style={{ color: "var(--amber-ink)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontWeight: 500, margin: "0 0 2px" }}>We don&apos;t recognise that email.</p>
                <p style={{ margin: 0, color: "var(--ink-soft)" }}>
                  Want to create an account?{" "}
                  <Link
                    href={`/onboarding?email=${encodeURIComponent(email)}`}
                    style={{ color: "var(--amber-ink)", textDecoration: "underline" }}
                  >
                    Get started →
                  </Link>
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="username webauthn"
                disabled={loading}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailNotFound(false) }}
                required
              />
            </div>
            {!magicLinkMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
            <button
              id="pleks-login-submit"
              type="submit"
              style={BTN_PRIMARY}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {getButtonLabel(magicLinkMode, loading)}
            </button>
          </form>

          {passkeyAvailable && (
            <>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 border-t border-rule" />
                <span className="text-xs text-muted-foreground px-2">or</span>
                <div className="flex-1 border-t border-rule" />
              </div>
              {passkeyError && (
                <div className="mt-2 text-xs text-danger text-center">{passkeyError}</div>
              )}
              <button
                type="button"
                style={{ ...BTN_GHOST, marginTop: 8 }}
                disabled={passkeyState === "in_progress"}
                onClick={() => {
                  passkeyReset()
                  void passkeyLogin(email || undefined)
                }}
              >
                {passkeyState === "in_progress"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <KeyRound className="h-4 w-4" />
                }
                Sign in with passkey
              </button>
            </>
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setMagicLinkMode(!magicLinkMode)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {magicLinkMode ? "Sign in with password instead" : "Email me a login link instead"}
            </button>
          </div>

          <p className="mt-3 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/onboarding" className="text-foreground hover:underline">
              Create one free
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
