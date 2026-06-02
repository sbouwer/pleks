"use client"

/**
 * lib/auth/passkeys/useEnrolPasskey.ts — React hook for inline passkey registration
 *
 * Auth:   caller-scoped (used from authenticated client components only)
 * Data:   POST /api/auth/passkeys/registration-options → WebAuthn browser ceremony →
 *         POST /api/auth/passkeys/registration-verify
 * Notes:  enrol() returns true on success, false on error, so callers can gate
 *         imperative logic without reading stale state from the render closure.
 */

import { useState, useRef, useEffect } from "react"
import { startRegistration } from "@simplewebauthn/browser"
import type { RegistrationResponseJSON } from "@simplewebauthn/browser"

type EnrolState = "idle" | "in_progress" | "success" | "error"

export function useEnrolPasskey() {
  const [state, setState] = useState<EnrolState>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // The enrolled credential's backup-state (synced vs device-bound), read from registration-verify.
  // Drives the chooser's Option-C backup nudge (ADDENDUM_70 D-70-05). null until a successful enrol.
  const [lastBackedUp, setLastBackedUp] = useState<boolean | null>(null)

  // The WebAuthn ceremony + verify fetch are long-lived awaits. If the host unmounts
  // mid-flight (e.g. /welcome navigating away on Continue), a setState here would throw
  // React #460. Gate every setState behind a mounted ref so a late resolve is a no-op.
  // enrol() still returns its boolean so imperative callers are unaffected.
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  async function enrol(label?: string): Promise<boolean> {
    if (mounted.current) { setState("in_progress"); setErrorMsg(null) }
    try {
      const optionsRes = await fetch("/api/auth/passkeys/registration-options", { method: "POST" })
      if (!optionsRes.ok) {
        // Surface the server's reason (e.g. the 403 host message) rather than a generic failure,
        // so a wrong-URL / unknown-host enrol shows an actionable error instead of dying silently.
        const reason = (await optionsRes.text().catch(() => "")).trim()
        throw new Error(reason || "Couldn't start passkey setup. Please try again.")
      }
      const options = await optionsRes.json() as Record<string, unknown>

      let registration: RegistrationResponseJSON
      try {
        registration = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] })
      } catch (e: unknown) {
        const err = e as Error
        if (err.name === "NotAllowedError") throw new Error("Cancelled")
        throw err
      }

      const verifyRes = await fetch("/api/auth/passkeys/registration-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: registration, label }),
      })
      const data = await verifyRes.json().catch(() => ({})) as { error?: string; backedUp?: boolean }
      if (!verifyRes.ok) throw new Error(data.error ?? "Verification failed")

      if (mounted.current) { setLastBackedUp(data.backedUp ?? null); setState("success") }
      return true
    } catch (e: unknown) {
      const err = e as Error
      if (mounted.current) { setErrorMsg(err.message ?? "Enrolment failed"); setState("error") }
      return false
    }
  }

  function reset() {
    if (mounted.current) { setState("idle"); setErrorMsg(null); setLastBackedUp(null) }
  }

  return { enrol, state, errorMsg, reset, lastBackedUp }
}
