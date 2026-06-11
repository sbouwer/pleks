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
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { Eye, EyeOff, Info } from "lucide-react"
import { usePasskeyLogin } from "@/lib/auth/passkeys/usePasskeyLogin"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { PasskeyButton } from "@/components/auth/PasskeyButton"
import { Wordmark } from "@/components/ui/Wordmark"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { FocusShell } from "@/components/layout/FocusShell"
import { signInWithPasswordAction } from "@/lib/actions/login"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.pleks.co.za"

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

function LoginContent() {
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")
  const emailParam = searchParams.get("email")
  const loopReset = searchParams.get("err") === "loop"

  const [email, setEmail] = useState(emailParam ?? "")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    loopReset ? "Your session got into a bad state and was reset. Please sign in again." : null
  )
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

  // If already authenticated, send to resolver — no role decision here (I-1).
  // Gate the getUser() validation on a LOCAL session check first: a clean visitor
  // with no token makes zero network calls (no spurious 403 on /auth/v1/user). If a
  // token exists but gotrue rejects it (stale/expired → 403), purge it locally so it
  // doesn't 403 on every subsequent page load.
  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      // Loop-reset: the gate broke a redirect loop and purged the org cookies. Clear
      // any client session remnant and show the form — do NOT auto-redirect back into
      // the resolver, or we'd risk re-entering the loop we just escaped.
      if (loopReset) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {})
        setChecking(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setChecking(false); return }
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data.user) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => {})
          setChecking(false)
          return
        }
        // Full-page nav: /auth/resolver is a route handler returning a server
        // redirect — client RSC navigation can't follow it (stuck skeleton / RSC
        // payload failure). The browser must follow resolver → destination.
        globalThis.location.href = resolverUrl()
      } catch {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {})
        setChecking(false)
      }
    })()
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

    // Server-side sign-in (keystone): rate-limiting + both-outcome logging + the new-device notice run inside the
    // action, not the browser. The action establishes the session but makes NO routing decision (Single-Pass).
    const result = await signInWithPasswordAction(email, password)

    if (!result.ok) {
      if (!emailExists) {
        setEmailNotFound(true)
      } else {
        setError(result.error ?? "Incorrect email or password")
      }
      setLoading(false)
      return
    }

    // Session established server-side. Hand off to the resolver — it owns routing AND the AAL2 → /login/mfa step.
    // Full-page nav so the resolver's server redirect is followed and the fresh session cookie is sent.
    globalThis.location.href = resolverUrl()
  }

  if (checking) {
    return (
      <FocusShell>
        <div className="fs-panel" style={{ maxWidth: 400 }} role="status" aria-busy="true">
          <span className="fs-knob" aria-hidden="true" />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div className="fs-skel" style={{ height: 24, width: "55%", margin: "0 auto 10px" }} />
              <div className="fs-skel" style={{ height: 13, width: "44%", margin: "0 auto" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="fs-skel" style={{ height: 44 }} />
              <div className="fs-skel" style={{ height: 44 }} />
              <div className="fs-skel" style={{ height: 48 }} />
            </div>
          </div>
          <span className="sr-only">Checking your session</span>
        </div>
      </FocusShell>
    )
  }

  if (magicLinkSent) {
    return (
      <FocusShell>
        <div className="fs-panel" style={{ maxWidth: 400, textAlign: "center" }}>
          <span className="fs-knob" aria-hidden="true" />
          <Wordmark href={MARKETING_URL} external style={{ justifyContent: "center", fontSize: 22 }} />
          <p className="fs-subhead" style={{ margin: "10px 0 20px" }}>Check your email for a login link.</p>
          <p className="text-sm text-muted-foreground mb-4">
            We sent a link to <strong>{email}</strong>
          </p>
          <button
            id="pleks-login-back"
            type="button"
            className="fs-cta-ghost"
            onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false) }}
          >
            Back to login
          </button>
        </div>
      </FocusShell>
    )
  }

  return (
    <FocusShell>
      <div className="fs-panel" style={{ maxWidth: 400 }}>
        <span className="fs-knob" aria-hidden="true" />
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Wordmark href={MARKETING_URL} external style={{ justifyContent: "center", fontSize: 22 }} />
          <p className="fs-subhead" style={{ margin: "10px 0 0" }}>Sign in to your account</p>
        </div>
        <div>
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
            <button id="pleks-login-submit" type="submit" className="fs-cta" disabled={loading}>
              <span className="fs-cta-bar" aria-hidden="true" />
              <span className="fs-cta-label">{getButtonLabel(magicLinkMode, loading)}</span>
              <span className="fs-cta-arrow" aria-hidden="true">→</span>
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
              <div style={{ marginTop: 8 }}>
                {/* Modal passkey sign-in; on success route through the resolver (same as
                    password login) — NOT "/", which is the logged-out marketing home. */}
                <PasskeyButton
                  label="Sign in with passkey"
                  loading={passkeyState === "in_progress"}
                  onClick={() => {
                    passkeyReset()
                    void passkeyLogin(email || undefined).then((ok) => {
                      if (ok) globalThis.location.href = resolverUrl()
                    })
                  }}
                />
              </div>
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
        </div>
      </div>
    </FocusShell>
  )
}
