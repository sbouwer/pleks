"use client"

/**
 * components/auth/StepUpModal.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState, useEffect, useRef } from "react"
import { Loader2, ShieldAlert } from "lucide-react"

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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(id)
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
          background: "var(--surface-raised)", borderRadius: 12,
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
            ? `You're about to ${actionLabel}. Enter the code from your authenticator app to continue.`
            : "Enter the 6-digit code from your authenticator app to continue."}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={loading}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 6,
              border: "1px solid var(--rule)", background: "var(--surface)",
              fontSize: 24, fontWeight: 600, textAlign: "center", letterSpacing: "0.3em",
              color: "var(--ink-base)", marginBottom: 12, boxSizing: "border-box",
            }}
          />

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
