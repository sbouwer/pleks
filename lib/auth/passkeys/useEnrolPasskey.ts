"use client"

/**
 * lib/auth/passkeys/useEnrolPasskey.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState } from "react"
import { startRegistration } from "@simplewebauthn/browser"
import type { RegistrationResponseJSON } from "@simplewebauthn/browser"

type EnrolState = "idle" | "in_progress" | "success" | "error"

export function useEnrolPasskey() {
  const [state, setState] = useState<EnrolState>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function enrol(label?: string) {
    setState("in_progress")
    setErrorMsg(null)
    try {
      const optionsRes = await fetch("/api/auth/passkeys/registration-options", { method: "POST" })
      if (!optionsRes.ok) throw new Error("Failed to get options")
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
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? "Verification failed")
      }

      setState("success")
    } catch (e: unknown) {
      const err = e as Error
      setErrorMsg(err.message ?? "Enrolment failed")
      setState("error")
    }
  }

  function reset() {
    setState("idle")
    setErrorMsg(null)
  }

  return { enrol, state, errorMsg, reset }
}
