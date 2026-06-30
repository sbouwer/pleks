"use client"

/**
 * app/(public)/reset-password/page.tsx — set a new password from a reset link
 *
 * Route:  /reset-password?token_hash=…&type=recovery (the reset email links HERE, not at Supabase's /auth/v1/verify)
 * Auth:   the recovery token is verified at SUBMIT (verifyOtp) — which establishes the session — then the password
 *         is set. Falls back to an already-established recovery session when no token_hash is present.
 * Notes:  Email-scanner safety (Microsoft Safe Links / Mimecast / Proofpoint pre-fetch links with a GET). If the
 *         email links at Supabase's /auth/v1/verify?…&type=recovery, that GET CONSUMES the single-use token, so a
 *         scanner burns it before the user clicks → the real reset lands on a dead token. Fix: the email carries
 *         the `token_hash` here, and verifyOtp runs on SUBMIT (a POST) — a scanner's GET can't spend the token.
 *         After updating the password we revoke ALL sessions (scope: global) so a stolen/old session can't survive
 *         the reset — the user re-authenticates (ADDENDUM_AUTH_HARDENING Tier-2). The password-changed log POST
 *         runs first (it needs the live session); revoke after.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Wordmark } from "@/components/ui/Wordmark"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    // Verify the recovery token HERE, on submit (POST) — never on page load — so an email scanner's pre-fetch GET
    // can't consume the single-use token before the user clicks. The link carries token_hash; verifyOtp
    // establishes the recovery session. (No token_hash → a session was already established; fall through.)
    const tokenHash = new URLSearchParams(globalThis.location.search).get("token_hash")
    if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      if (verifyError) {
        toast.error("This reset link is invalid or has expired. Please request a new one.")
        setLoading(false)
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Password updated successfully.")
      // Await so the auth_events record + notification land before we navigate away (fetch would cancel).
      await fetch("/api/auth/log-password-changed", { method: "POST" }).catch(() => {})
      // Revoke ALL sessions (incl. any attacker's stolen session) — a reset must not leave one alive. Runs
      // after the log POST, which needs the live session. User re-authenticates with the new password.
      await supabase.auth.signOut({ scope: "global" }).catch(() => {})
      router.push("/login")
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle><Wordmark className="mb-2" style={{ fontSize: 22 }} /></CardTitle>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
