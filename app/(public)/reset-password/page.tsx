"use client"

/**
 * app/(public)/reset-password/page.tsx — set a new password from a reset link
 *
 * Route:  /reset-password (reached via the recovery link → Supabase recovery session)
 * Auth:   the recovery session established by the reset link
 * Notes:  After updating the password we revoke ALL sessions (scope: global) so a stolen/old session can't
 *         survive the reset — the user re-authenticates with the new password (ADDENDUM_AUTH_HARDENING Tier-2).
 *         The password-changed log POST runs first (it needs the live session); revoke after.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import Image from "next/image"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
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
          <CardTitle><Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-8 w-auto mx-auto mb-2" /></CardTitle>
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
