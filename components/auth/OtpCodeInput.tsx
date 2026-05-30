"use client"

/**
 * components/auth/OtpCodeInput.tsx — Shared 6-digit one-time-code input
 *
 * Notes:  Single source for the TOTP/OTP entry used by /login/mfa and StepUpModal. Owns the
 *         digits-only, max-6 sanitisation so callers just receive a clean value. Styling is
 *         theme-token based so it sits correctly in both the auth card and the step-up modal.
 */

interface OtpCodeInputProps {
  value:     string
  onChange:  (digits: string) => void
  disabled?: boolean
  autoFocus?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function OtpCodeInput({ value, onChange, disabled, autoFocus, inputRef }: Readonly<OtpCodeInputProps>) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      maxLength={6}
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: 6,
        border: "1px solid var(--rule)", background: "var(--surface-raised)",
        fontSize: 24, fontWeight: 600, textAlign: "center", letterSpacing: "0.3em",
        color: "var(--ink-base)", outline: "none", boxSizing: "border-box",
      }}
    />
  )
}
