"use client"

/**
 * lib/auth/passkeys/usePasskeyLogin.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState } from "react"
import { startAuthentication } from "@simplewebauthn/browser"
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser"
import { createClient } from "@/lib/supabase/client"

type LoginState = "idle" | "in_progress" | "success" | "error"

export function usePasskeyLogin() {
  const [state, setState] = useState<LoginState>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function login(email?: string) {
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
          useBrowserAutofill: !email,
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
