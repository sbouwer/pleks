"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
import { Eye, EyeOff, Loader2 } from "lucide-react"

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
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkMode, setMagicLinkMode] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect")

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (magicLinkMode) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${globalThis.location.origin}/auth/callback?next=${redirect || "/dashboard"}`,
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
    } else if (redirect) {
      router.push(redirect)
    } else if (membership.role === "tenant") {
      router.push("/portal")
    } else if (membership.role === "contractor") {
      router.push("/contractor")
    } else {
      router.push("/dashboard")
    }
  }

  if (magicLinkSent) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle><Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-auto mx-auto" /></CardTitle>
            <CardDescription>Check your email for a login link.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              We sent a link to <strong>{email}</strong>
            </p>
            <Button
              variant="outline"
              onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false) }}
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle><Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-auto mx-auto" /></CardTitle>
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {getButtonLabel(magicLinkMode, loading)}
            </Button>
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
        </CardContent>
      </Card>
    </div>
  )
}
