"use client"

/**
 * lib/auth/passkeys/usePasskeyLogin.ts — Client hook for passkey sign-in
 *
 * Auth:   public — POSTs /api/auth/passkeys/auth-options → WebAuthn get() → auth-verify,
 *         then sets the returned Supabase session and navigates to /.
 * Notes:  `conditional` selects the WebAuthn UI mode. An explicit "Sign in with passkey"
 *         BUTTON must use MODAL mode (conditional:false) — it opens the picker immediately.
 *         `useBrowserAutofill:true` is conditional UI: it shows NO modal and waits for the
 *         user to pick a passkey from an input's autofill dropdown — if invoked from a
 *         button (no autofill surface) it just spins forever with no error. Only pass
 *         conditional:true from a mount-time effect on a field with autoComplete="webauthn".
 */

import { useState } from "react"
import { startAuthentication } from "@simplewebauthn/browser"
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser"
import { createClient } from "@/lib/supabase/client"

type LoginState = "idle" | "in_progress" | "success" | "error"

export function usePasskeyLogin() {
  const [state, setState] = useState<LoginState>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function login(email?: string, opts?: { conditional?: boolean }) {
    setState("in_progress")
    setErrorMsg(null)
    try {
      const optionsRes = await fetch("/api/auth/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!optionsRes.ok) throw new Error("Failed to get options")
      const options = await optionsRes.json() as Record<string, unknown>

      let authResponse: AuthenticationResponseJSON
      try {
        authResponse = await startAuthentication({
          optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"],
          // Modal by default (explicit button). Autofill/conditional UI only when asked for.
          useBrowserAutofill: opts?.conditional ?? false,
        })
      } catch (e: unknown) {
        const err = e as Error
        if (err.name === "NotAllowedError") throw new Error("Cancelled")
        throw err
      }

      const verifyRes = await fetch("/api/auth/passkeys/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authResponse }),
      })
      if (!verifyRes.ok) throw new Error("Authentication failed. Please try again.")

      const data = await verifyRes.json() as { access_token: string; refresh_token: string }
      const supabase = createClient()
      await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })

      setState("success")
      // Navigate to root — role-switching machinery resolves the right workspace
      window.location.href = "/"
    } catch (e: unknown) {
      const err = e as Error
      setErrorMsg(err.message ?? "Passkey login failed")
      setState("error")
    }
  }

  function reset() {
    setState("idle")
    setErrorMsg(null)
  }

  return { login, state, errorMsg, reset }
}
