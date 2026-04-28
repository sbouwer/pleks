"use client"

/**
 * app/(public)/login/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react"
import { usePasskeyLogin } from "@/lib/auth/passkeys/usePasskeyLogin"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { safeRedirect } from "@/lib/auth/safe-redirect"

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

async function routeAfterLogin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  redirectParam: string | null,
  router: ReturnType<typeof useRouter>
) {
  const [agentRes, tenantRes, landlordRes] = await Promise.all([
    supabase.from("user_orgs").select("role, org_id").eq("user_id", userId).is("deleted_at", null),
    supabase.from("user_orgs_tenants").select("tenant_id, org_id").eq("user_id", userId),
    supabase.from("landlords").select("id, org_id").eq("auth_user_id", userId).is("deleted_at", null).eq("portal_access_enabled", true),
  ])

  const roleCount = (agentRes.data?.length ?? 0)
    + (tenantRes.data?.length ?? 0)
    + (landlordRes.data?.length ?? 0)

  if (roleCount === 0) { router.push("/onboarding"); return }

  if (roleCount > 1) {
    router.push(redirectParam ? `/select-role?redirect=${encodeURIComponent(safeRedirect(redirectParam))}` : "/select-role")
    return
  }

  if (redirectParam) { router.push(safeRedirect(redirectParam)); return }
  if (agentRes.data?.[0]) {
    const role = agentRes.data[0].role
    if (role === "tenant") router.push("/tenant/dashboard")
    else if (role === "contractor" || role === "supplier") router.push("/supplier/dashboard")
    else router.push("/dashboard")
  } else if (tenantRes.data?.[0]) {
    router.push("/tenant/dashboard")
  } else if (landlordRes.data?.[0]) {
    router.push("/landlord/dashboard")
  } else {
    router.push("/dashboard")
  }
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
  const { login: passkeyLogin, state: passkeyState, errorMsg: passkeyError, reset: passkeyReset } = usePasskeyLogin()

  // Capability detection
  useEffect(() => {
    canUsePasskeys().then(c => setPasskeyAvailable(c.available))
  }, [])

  // If already authenticated, redirect
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace(safeRedirect(redirectParam))
        } else {
          setChecking(false)
        }
      })
      .catch(() => {
        setChecking(false)
      })
  }, [router, redirectParam])

  async function handleLogin(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (magicLinkMode) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${globalThis.location.origin}/auth/callback?next=${safeRedirect(redirectParam)}`,
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

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      // Use a generic message for all sign-in failures — differentiated errors
      // (e.g. "Email not confirmed") leak account existence and enable enumeration.
      setError("Incorrect email or password")
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push("/dashboard")
      return
    }

    // Check MFA requirement before role routing
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.nextLevel === "aal2" && aalData?.currentLevel === "aal1") {
      const dest = redirectParam ? `/login/mfa?redirect=${encodeURIComponent(safeRedirect(redirectParam))}` : "/login/mfa"
      router.push(dest)
      return
    }

    await routeAfterLogin(supabase, user.id, redirectParam, router)
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
              <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </Link>
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
              <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </Link>
            </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
              {error}
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
                onChange={(e) => setEmail(e.target.value)}
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
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
