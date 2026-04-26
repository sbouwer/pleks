"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"

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

  // If already authenticated, redirect
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace(redirectParam || "/dashboard")
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
          emailRedirectTo: `${globalThis.location.origin}/auth/callback?next=${redirectParam || "/dashboard"}`,
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
      if (signInError.message.includes("Email not confirmed")) {
        setError("Please verify your email first. Check your inbox.")
      } else {
        setError("Incorrect email or password")
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push("/dashboard")
      return
    }

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("role")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .single()

    if (!membership) {
      router.push("/onboarding")
    } else if (redirectParam) {
      router.push(redirectParam)
    } else if (membership.role === "tenant") {
      router.push("/tenant")
    } else if (membership.role === "contractor") {
      router.push("/supplier")
    } else {
      router.push("/dashboard")
    }
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
                autoComplete="email"
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
