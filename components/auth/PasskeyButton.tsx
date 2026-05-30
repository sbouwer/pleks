"use client"

/**
 * components/auth/PasskeyButton.tsx — Shared "use a passkey" button
 *
 * Notes:  Single source for the passkey affordance across /login (variant "shell" → fs-cta-ghost),
 *         /login/mfa (shell), and StepUpModal (variant "modal" → inline, sits in the overlay).
 *         Shows a spinner while in flight. The shell variant needs focus-shell.css loaded (it is
 *         on the auth pages via FocusShell).
 */
import { KeyRound, Loader2 } from "lucide-react"

interface PasskeyButtonProps {
  onClick:   () => void
  loading?:  boolean
  disabled?: boolean
  label?:    string
  variant?:  "shell" | "modal"
}

export function PasskeyButton({
  onClick, loading = false, disabled = false, label = "Use a passkey", variant = "shell",
}: Readonly<PasskeyButtonProps>) {
  const icon = loading
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <KeyRound className="h-4 w-4" />

  if (variant === "modal") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "10px 16px", borderRadius: 6, fontSize: 14, fontWeight: 600,
          cursor: disabled || loading ? "default" : "pointer",
          border: "1px solid var(--rule)", background: "var(--surface)", color: "var(--ink-base)",
        }}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <button type="button" className="fs-cta-ghost" onClick={onClick} disabled={disabled || loading}>
      {icon}
      {label}
    </button>
  )
}
