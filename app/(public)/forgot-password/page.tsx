"use client"

/**
 * app/(public)/forgot-password/page.tsx — request a password-reset email
 *
 * Route:  /forgot-password
 * Auth:   public
 * Data:   requestPasswordReset server action (rate-limited per IP + email; resetPasswordForEmail server-side)
 * Notes:  Goes through the action — never the browser Supabase client — so reset emails are throttled and the
 *         email-existence answer isn't leaked (ADDENDUM_AUTH_HARDENING Tier-2).
 */
import { useState } from "react"
import { requestPasswordReset } from "@/lib/actions/passwordReset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    // Server action throttles + sends server-side (the reset link's origin is the canonical app URL there).
    const res = await requestPasswordReset(email)
    if ("error" in res) {
      toast.error(res.error)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle><Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-8 w-auto mx-auto mb-2" /></CardTitle>
          <CardDescription>
            {sent ? "Check your email for a reset link." : "Enter your email to receive a reset link."}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="hover:text-foreground">
                Back to login
              </Link>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
