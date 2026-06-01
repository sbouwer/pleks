"use client"

/**
 * components/auth/SecureAccount.tsx — "Pick a primary factor + a backup" MFA enrolment (ADDENDUM_70 Slice B)
 *
 * Auth:   authenticated, AAL1-reachable (you enrol your first factor here before you have AAL2).
 * Data:   passkey via useEnrolPasskey (registration ceremony); TOTP via <EnrolTotp embedded>.
 * Notes:  Replaces the TOTP-first flow now that a passkey is AAL2 (ADDENDUM_69). Pick Passkey OR
 *         Authenticator as primary; both are AAL2. Then a backup of the OTHER factor, gated by
 *         Option C (D-70-04/05/06): a SYNCED passkey self-recovers → backup is skippable with a
 *         soft note; a TOTP or device-bound passkey does NOT self-recover → backup is required
 *         (skip only behind an explicit risk acknowledgement). The copy explains WHY each time —
 *         this is account protection, not a checklist.
 */

import { useState } from "react"
import { KeyRound, ShieldCheck, Smartphone, Loader2, CheckCircle2 } from "lucide-react"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import { EnrolTotp } from "@/components/auth/EnrolTotp"
import { ActionButton } from "@/components/ui/actions"
import { safeRedirect } from "@/lib/auth/safe-redirect"

type Primary = "passkey" | "totp"
type Phase = "choose" | "enrol-passkey" | "enrol-totp-primary" | "backup" | "enrol-passkey-backup" | "enrol-totp-backup" | "done"

interface SecureAccountProps {
  redirectTo?: string
  /** Forced enrolment (resolver mfa_enrol) vs voluntary (Settings). Reserved for copy nuance. */
  mandatory?: boolean
  /** Embedded host (welcome) takes over on completion instead of redirecting. */
  onComplete?: () => void
}

export function SecureAccount({ redirectTo, onComplete }: Readonly<SecureAccountProps>) {
  const safeNext = redirectTo ? safeRedirect(redirectTo) : "/dashboard"
  const passkey = useEnrolPasskey()

  const [phase, setPhase] = useState<Phase>("choose")
  const [primary, setPrimary] = useState<Primary | null>(null)
  const [riskAck, setRiskAck] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function finish() {
    if (onComplete) onComplete()
    else globalThis.location.href = safeNext
  }

  async function enrolPasskey(label: string, onDone: () => void) {
    setError(null)
    const ok = await passkey.enrol(label)
    if (ok) onDone()
    else setError(passkey.errorMsg ?? "Couldn't set up the passkey. Please try again.")
  }

  // ── Step 1: choose your primary factor ────────────────────────────────────────────────────
  if (phase === "choose") {
    return (
      <Shell
        title="Set up a second way to confirm it's you"
        desc="Alongside your password, this protects your tenants', landlords' and trust data if your password is ever stolen. Choose how you'll verify — both options are equally secure."
      >
        <div className="grid gap-3">
          <ChoiceCard
            icon={<KeyRound className="h-5 w-5" />}
            title="Use a passkey"
            badge="Recommended"
            desc="Your fingerprint, face, or device PIN. Nothing to type, nothing to lose, and it can't be phished."
            onClick={() => { setPrimary("passkey"); setPhase("enrol-passkey"); void enrolPasskey("Primary device", () => setPhase("backup")) }}
          />
          <ChoiceCard
            icon={<Smartphone className="h-5 w-5" />}
            title="Use an authenticator app"
            desc="A 6-digit code from Google Authenticator, Authy, 1Password or similar. Best if your device doesn't support passkeys."
            onClick={() => { setPrimary("totp"); setPhase("enrol-totp-primary") }}
          />
        </div>
        {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
      </Shell>
    )
  }

  // ── Enrolling the passkey primary (the browser ceremony is in flight) ─────────────────────
  if (phase === "enrol-passkey") {
    return (
      <Shell title="Setting up your passkey…" desc="Follow your device's prompt to confirm.">
        <div className="flex justify-center py-6">
          {passkey.state === "error"
            ? (
              <div className="text-center">
                <p className="mb-3 text-sm text-danger">{error ?? passkey.errorMsg ?? "Setup was cancelled."}</p>
                <ActionButton tone="secondary" onClick={() => { passkey.reset(); setPhase("choose") }}>Back</ActionButton>
              </div>
            )
            : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        </div>
      </Shell>
    )
  }

  // ── Enrolling the TOTP primary (EnrolTotp owns the QR + verify; we own the backup step) ───
  if (phase === "enrol-totp-primary") {
    return (
      <Shell title="Set up your authenticator" desc="Scan the code with your app and enter the 6-digit code.">
        <EnrolTotp embedded onVerified={() => setPhase("backup")} redirectTo={redirectTo} />
      </Shell>
    )
  }

  // ── Step 2: backup factor (Option C) ──────────────────────────────────────────────────────
  if (phase === "backup") {
    const selfRecovering = primary === "passkey" && passkey.lastBackedUp === true
    const backupIsPasskey = primary === "totp"   // primary TOTP → backup is a passkey; primary passkey → backup is TOTP
    const backupLabel = backupIsPasskey ? "Add a passkey" : "Add an authenticator app"

    const why = (() => {
      if (selfRecovering) {
        return "Your passkey is saved to your device's account (iCloud or Google), so it already follows you to a new phone. Adding an authenticator app is an extra safety net — a good idea, but your call."
      }
      if (primary === "passkey") {
        return "This passkey is tied to this device only. Add an authenticator app so that if you lose or replace this device, you can still get in — without waiting on a support reset."
      }
      return "Authenticator codes live on one phone. Add a passkey (or a second authenticator) so a lost or replaced phone never locks you out of your account — and out of the people relying on you."
    })()

    function addBackup() {
      if (backupIsPasskey) { setPhase("enrol-passkey-backup"); void enrolPasskey("Backup device", finish) }
      else setPhase("enrol-totp-backup")
    }

    return (
      <Shell title="Add a backup so you're never locked out" desc={why}>
        <div className="et-actions">
          <ActionButton tone="primary" onClick={addBackup}>{backupLabel}</ActionButton>
          {selfRecovering ? (
            <ActionButton tone="secondary" onClick={finish}>Skip for now — my passkey is backed up</ActionButton>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <label className="flex items-start gap-2.5 text-[13px] leading-snug text-muted-foreground" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} style={{ marginTop: 2 }} />
                <span>I understand that without a backup I could be locked out if I lose my device, and would need an agency or support reset to get back in.</span>
              </label>
              <button
                type="button"
                onClick={finish}
                disabled={!riskAck}
                className="mt-2.5 w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Continue without a backup
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
      </Shell>
    )
  }

  // ── Enrolling a TOTP backup ───────────────────────────────────────────────────────────────
  if (phase === "enrol-totp-backup") {
    return (
      <Shell title="Add your authenticator backup" desc="Scan the code and enter the 6-digit code.">
        <EnrolTotp embedded onVerified={finish} redirectTo={redirectTo} />
      </Shell>
    )
  }

  // ── Enrolling a passkey backup (reuses the passkey ceremony spinner) ──────────────────────
  if (phase === "enrol-passkey-backup") {
    return (
      <Shell title="Setting up your passkey…" desc="Follow your device's prompt to confirm.">
        <div className="flex justify-center py-6">
          {passkey.state === "error"
            ? (
              <div className="text-center">
                <p className="mb-3 text-sm text-danger">{error ?? passkey.errorMsg ?? "Setup was cancelled."}</p>
                <ActionButton tone="secondary" onClick={() => { passkey.reset(); setPhase("backup") }}>Back</ActionButton>
              </div>
            )
            : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        </div>
      </Shell>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────────────────────
  return (
    <Shell title="You're protected" desc="Your account now has a second layer of security.">
      <div className="flex flex-col items-center gap-4 py-2">
        <CheckCircle2 className="h-12 w-12" style={{ color: "var(--amber)" }} />
        <ActionButton tone="primary" onClick={finish}>Continue</ActionButton>
      </div>
    </Shell>
  )
}

function Shell({ title, desc, children }: Readonly<{ title: string; desc: string; children: React.ReactNode }>) {
  return (
    <div className="et-wrap">
      <div className="et-card">
        <div className="et-header">
          <div className="et-icon"><ShieldCheck size={32} color="var(--ink-mute)" aria-hidden="true" /></div>
          <p className="et-title">{title}</p>
          <p className="et-desc">{desc}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function ChoiceCard({ icon, title, desc, badge, onClick }: Readonly<{
  icon: React.ReactNode; title: string; desc: string; badge?: string; onClick: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-brand hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{desc}</span>
      </span>
    </button>
  )
}
