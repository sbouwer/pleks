"use client"

/**
 * lib/auth/passkeys/useEnrolPasskey.tsx — React hook for inline passkey registration
 *
 * Auth:   caller-scoped (used from authenticated client components only)
 * Data:   POST /api/auth/passkeys/registration-options → WebAuthn browser ceremony →
 *         POST /api/auth/passkeys/registration-verify
 * Notes:  enrol() returns true on success, false on error, so callers can gate
 *         imperative logic without reading stale state from the render closure.
 *
 *         ⚠ CALLERS MUST RENDER `stepUpModal`. Adding a passkey to an account that already has one
 *         requires step-up (M-127 — lib/auth/passkeys/enrol-assurance.ts), and this hook owns that
 *         401 → modal → retry flow so the four call sites cannot each get it subtly different. A
 *         caller that drops the node still enrols the FIRST passkey (bootstrap needs no step-up) and
 *         then fails every later one with "Cancelled" — which is why the modal is returned from the
 *         hook rather than left to the caller to remember.
 *
 *         WAS `.ts`. It returns JSX now; the old extension is deleted in the same commit, because a
 *         surviving `.ts` shadow makes TypeScript resolve the extensionless import to the stale file
 *         (check-extension-stem-pairs).
 */

import { useState, useRef, useEffect } from "react"
import { startRegistration } from "@simplewebauthn/browser"
import type { RegistrationResponseJSON } from "@simplewebauthn/browser"
import { StepUpModal } from "@/components/auth/StepUpModal"

type EnrolState = "idle" | "in_progress" | "success" | "error"

export function useEnrolPasskey() {
  const [state, setState] = useState<EnrolState>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // The enrolled credential's backup-state (synced vs device-bound), read from registration-verify.
  // Drives the chooser's Option-C backup nudge (ADDENDUM_70 D-70-05). null until a successful enrol.
  const [lastBackedUp, setLastBackedUp] = useState<boolean | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  // The WebAuthn ceremony + verify fetch are long-lived awaits. If the host unmounts
  // mid-flight (e.g. /welcome navigating away on Continue), a setState here would throw
  // React #460. Gate every setState behind a mounted ref so a late resolve is a no-op.
  // enrol() still returns its boolean so imperative callers are unaffected.
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  // Bridges the modal (event-driven) back into enrol()'s promise, so the step-up round trip stays
  // invisible to the four call sites — they still await one enrol() and get one boolean.
  const resume = useRef<((token: string | null) => void) | null>(null)

  function awaitStepUp(token: string): Promise<string | null> {
    return new Promise((resolve) => {
      resume.current = resolve
      setPendingToken(token)
    })
  }

  function settleStepUp(token: string | null) {
    const resolve = resume.current
    resume.current = null
    setPendingToken(null)
    resolve?.(token)
  }

  /** The server's own words, whichever content type it used, and never the raw body as a fallback. */
  async function failureReason(res: Response): Promise<string> {
    const body = (await res.clone().text().catch(() => "")).trim()
    const fallback = "Couldn't start passkey setup. Please try again."
    if (body.startsWith("{")) {
      // A truncated JSON body must not become the message either — that is the same defect one
      // layer down. Anything unparseable falls back rather than being shown.
      try { return ((JSON.parse(body) as { error?: string }).error ?? fallback) } catch { return fallback }
    }
    return body || fallback
  }

  /** 401 + a challengeToken means "re-authenticate and come back". Anything else is a real failure. */
  async function challengeFrom(res: Response): Promise<string | null> {
    if (res.status !== 401) return null
    const data = await res.clone().json().catch(() => ({})) as { challengeToken?: string | null }
    return data.challengeToken ?? null
  }

  async function run(label: string | undefined, stepUpToken: string | null): Promise<boolean> {
    if (mounted.current) { setState("in_progress"); setErrorMsg(null) }
    try {
      const optionsRes = await fetch("/api/auth/passkeys/registration-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepUpToken }),
      })
      if (!optionsRes.ok) {
        // Step up ONCE. `stepUpToken` already set means we have been round the loop and the server
        // still refused — retrying would spin, so fall through to the error path.
        const challenge = stepUpToken ? null : await challengeFrom(optionsRes)
        if (challenge) {
          const verified = await awaitStepUp(challenge)
          if (!verified) throw new Error("Cancelled")
          return run(label, verified)
        }
        // Surface the server's reason (e.g. the 403 host message) rather than a generic failure,
        // so a wrong-URL / unknown-host enrol shows an actionable error instead of dying silently.
        // The two halves of this route speak different content types — plain text for the host
        // refusals, JSON for the step-up ones — and reading the JSON body as text put the raw
        // `{"challengeToken":…}` object (token and all) in front of the user.
        throw new Error(await failureReason(optionsRes))
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
        body: JSON.stringify({ response: registration, label, stepUpToken }),
      })
      const data = await verifyRes.json().catch(() => ({})) as { error?: string; backedUp?: boolean }
      // No step-up retry here even on a 401: the WebAuthn challenge is consumed-on-attempt, so the
      // whole ceremony would have to be redone. options refuses first in the normal flow, which is
      // the point of guarding both halves — reaching a refusal HERE means something raced, and a
      // plain error the user can retry from is the honest outcome.
      if (!verifyRes.ok) throw new Error(data.error ?? "Verification failed")

      if (mounted.current) { setLastBackedUp(data.backedUp ?? null); setState("success") }
      return true
    } catch (e: unknown) {
      const err = e as Error
      if (mounted.current) { setErrorMsg(err.message ?? "Enrolment failed"); setState("error") }
      return false
    }
  }

  async function enrol(label?: string): Promise<boolean> {
    return run(label, null)
  }

  function reset() {
    if (mounted.current) { setState("idle"); setErrorMsg(null); setLastBackedUp(null) }
  }

  const stepUpModal = pendingToken ? (
    <StepUpModal
      open
      actionLabel="add a passkey"
      challengeToken={pendingToken}
      onSuccess={() => settleStepUp(pendingToken)}
      onCancel={() => settleStepUp(null)}
    />
  ) : null

  return { enrol, state, errorMsg, reset, lastBackedUp, stepUpModal }
}
