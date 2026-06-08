"use client"

/**
 * components/auth/PasskeyManager.tsx — enrol, list + revoke the user's passkeys
 *
 * Auth:   the active session
 * Data:   user_passkeys via /api/auth/passkeys/{list,revoke}; WebAuthn enrol via useEnrolPasskey
 * Notes:  Rendered in Settings → Security (Two-factor tab). Canonical styling + buttons (Component Canon).
 */

import { useState, useEffect } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { canUsePasskeys } from "@/lib/auth/passkeys/capability"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import { ActionButton, RemoveButton } from "@/components/ui/actions"

interface Passkey {
  id: string
  label: string
  device_type: string
  last_used_at: string | null
  created_at: string
}

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [capable, setCapable] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const { enrol, state: enrolState, errorMsg: enrolError, reset } = useEnrolPasskey()

  async function loadPasskeys() {
    setLoading(true)
    const res = await fetch("/api/auth/passkeys/list")
    if (res.ok) {
      const data = await res.json() as { passkeys: Passkey[] }
      setPasskeys(data.passkeys ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    canUsePasskeys().then(c => setCapable(c.available))
    fetch("/api/auth/passkeys/list")
      .then(r => r.ok ? r.json() as Promise<{ passkeys: Passkey[] }> : null)
      .then(data => { if (data) setPasskeys(data.passkeys ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRevoke(id: string) {
    if (!confirm("Remove this passkey?")) return
    setRevoking(id)
    const res = await fetch("/api/auth/passkeys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkeyId: id }),
    })
    if (res.ok) {
      setPasskeys(prev => prev.filter(p => p.id !== id))
    }
    setRevoking(null)
  }

  async function handleEnrol() {
    await enrol()
    if (enrolState !== "error") {
      await loadPasskeys()
      reset()
    }
  }

  function renderPasskeyList() {
    if (loading) {
      return (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (passkeys.length === 0) {
      return (
        <div className="flex items-start gap-4 p-4">
          <KeyRound className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">No passkeys enrolled</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Sign in with your fingerprint, face, or hardware key — no password needed.
            </div>
          </div>
        </div>
      )
    }
    return passkeys.map(pk => (
      <div key={pk.id} className="flex items-start gap-4 p-4">
        <KeyRound className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{pk.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {pk.device_type === "multiDevice" ? "Synced passkey · " : ""}
            {pk.last_used_at
              ? `Last used ${formatDistanceToNow(new Date(pk.last_used_at), { addSuffix: true })}`
              : `Added ${formatDistanceToNow(new Date(pk.created_at), { addSuffix: true })}`}
          </div>
        </div>
        <RemoveButton
          mode="label"
          label={revoking === pk.id ? "Removing…" : "Remove"}
          onClick={() => handleRevoke(pk.id)}
          disabled={revoking === pk.id}
        />
      </div>
    ))
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Passkeys
      </h2>
      <div className="divide-y divide-border rounded-[var(--r-button)] border border-border">
        {renderPasskeyList()}

        {capable && (
          <div className="p-4">
            {enrolError && (
              <div className="mb-3 text-xs text-destructive">{enrolError}</div>
            )}
            <ActionButton
              tone="primary"
              icon={enrolState === "in_progress" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              disabled={enrolState === "in_progress"}
              onClick={handleEnrol}
            >
              {enrolState === "success" ? "Passkey added" : "Add a passkey"}
            </ActionButton>
          </div>
        )}

        {!capable && !loading && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            Your browser or device doesn&apos;t support passkeys. Use Chrome, Safari, or Edge on a modern device.
          </div>
        )}
      </div>
    </section>
  )
}
