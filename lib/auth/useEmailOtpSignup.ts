"use client"

/**
 * lib/auth/useEmailOtpSignup.ts — applicant account creation at completion via Supabase email-OTP (14R auth).
 *
 * Auth:   "start cheap, end expensive" — at the end of their own section an applicant creates a Pleks account with a
 *         6-digit email CODE entered IN-FLOW (no magic-link tab-switch). send() OMITS emailRedirectTo so Supabase
 *         sends a code, not a link; verify() confirms it, creating + signing in the auth user in the same browser
 *         client → the session cookie is set, so the caller then hits /link-account to promote to a tenant.
 * Notes:  for an EXISTING Pleks account the OTP simply logs them in (shouldCreateUser still works for both). The
 *         code is the mailbox proof + the bot wall (a bot needs a real, confirmed inbox).
 */
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function useEmailOtpSignup() {
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Send the 6-digit code to `email` (creates the account on verify). Returns false on failure (error set). */
  async function send(email: string): Promise<boolean> {
    setError(null)
    setSending(true)
    try {
      const { error: e } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (e) { setError(e.message); return false }
      setSent(true)
      return true
    } finally {
      setSending(false)
    }
  }

  /** Verify the code → creates + signs in the account (sets the session). Returns false on a bad/expired code. */
  async function verify(email: string, code: string): Promise<boolean> {
    setError(null)
    setVerifying(true)
    try {
      const { error: e } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" })
      if (e) { setError(/expired|invalid/i.test(e.message) ? "That code is incorrect or has expired." : e.message); return false }
      return true
    } finally {
      setVerifying(false)
    }
  }

  return { send, verify, sending, verifying, sent, error, reset: () => { setSent(false); setError(null) } }
}
