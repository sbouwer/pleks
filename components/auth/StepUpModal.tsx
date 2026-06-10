"use client"

/**
 * components/auth/StepUpModal.tsx — Fresh re-authentication for a sensitive action
 *
 * Auth:   Posts to /api/auth/step-up (TOTP) or /api/auth/step-up/passkey (passkey) to verify
 *         a pending step_up_challenges token before a guarded action proceeds.
 * Notes:  ADDENDUM_69 Slice B added the passkey path — offered when the user has an enrolled
 *         passkey and the browser supports WebAuthn; TOTP is always available as fallback.
 *         A passkey at LOGIN does not satisfy step-up: this triggers a FRESH assertion.
 */

import { useState, useEffect, useRef } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { OtpCodeInput } from "@/components/auth/OtpCodeInput"
import { PasskeyButton } from "@/components/auth/PasskeyButton"

interface StepUpModalProps {
  open: boolean
  actionLabel?: string
  challengeToken: string
  onSuccess: () => void
  onCancel: () => void
}

export function StepUpModal({ open, actionLabel, challengeToken, onSuccess, onCancel }: StepUpModalProps) {
  if (!open) return null
  return (
    <StepUpModalInner
      key={challengeToken}
      actionLabel={actionLabel}
      challengeToken={challengeToken}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  )
}

function StepUpModalInner({ actionLabel, challengeToken, onSuccess, onCancel }: Readonly<Omit<StepUpModalProps, "open">>) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passkeyOffered, setPasskeyOffered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(id)
  }, [])

  // Offer passkey step-up only if the browser supports it AND the user has one enrolled.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const cap = await canUsePasskeys()
        if (!cap.available) return
        const res = await fetch("/api/auth/passkeys/list")
        if (!res.ok) return
        const { passkeys } = await res.json() as { passkeys?: unknown[] }
        if (active && (passkeys?.length ?? 0) > 0) setPasskeyOffered(true)
      } catch { /* passkey just stays hidden */ }
    })()
    return () => { active = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError(null)

    const res = await fetch("/api/auth/step-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code }),
    })

    setLoading(false)
    if (res.ok) {
      onSuccess()
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? "Incorrect code. Please try again.")
      setCode("")
      inputRef.current?.focus()
    }
  }

  async function handlePasskey() {
    setLoading(true)
    setError(null)
    try {
      const optRes = await fetch("/api/auth/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!optRes.ok) throw new Error("start_failed")
      const options = await optRes.json() as Record<string, unknown>

      const { startAuthentication } = await import("@simplewebauthn/browser")
      const assertion = await startAuthentication({
        optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"],
        useBrowserAutofill: false,
      })

      const res = await fetch("/api/auth/step-up/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, assertion }),
      })
      if (res.ok) { onSuccess(); return }
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? "Passkey verification failed.")
    } catch (e: unknown) {
      const err = e as Error
      setError(err.name === "NotAllowedError" ? "Passkey cancelled." : "Couldn't verify with passkey.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: "var(--surface-elevated)", borderRadius: 12,
          border: "1px solid var(--rule)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: 28, maxWidth: 380, width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <ShieldAlert style={{ width: 20, height: 20, color: "var(--ink-faint)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Confirm it&apos;s you</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 20 }}>
          {actionLabel
            ? `You're about to ${actionLabel}. Re-confirm to continue.`
            : "Re-confirm to continue."}
        </p>

        {passkeyOffered && (
          <>
            <div style={{ marginBottom: 14 }}>
              <PasskeyButton onClick={handlePasskey} loading={loading} variant="modal" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>or enter a code</span>
              <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <OtpCodeInput value={code} onChange={setCode} disabled={loading} inputRef={inputRef} />
          </div>

          {error && (
            <div style={{
              marginBottom: 12, padding: "8px 12px", borderRadius: 6,
              background: "var(--danger-bg)", border: "1px solid rgba(220,50,50,0.2)",
              fontSize: 12, color: "var(--danger)",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1, padding: "9px 16px", borderRadius: 5, fontSize: 14,
                fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--rule)", background: "transparent", color: "var(--ink-base)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || code.length < 6}
              style={{
                flex: 2, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, padding: "9px 16px", borderRadius: 5, fontSize: 14, fontWeight: 600,
                cursor: code.length < 6 ? "default" : "pointer", border: "none",
                background: "oklch(0.68 0.14 65)", color: "oklch(0.18 0.012 260)",
                opacity: code.length < 6 || loading ? 0.6 : 1,
              }}
            >
              {loading && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
