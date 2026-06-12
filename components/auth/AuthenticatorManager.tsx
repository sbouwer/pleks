"use client"

/**
 * components/auth/AuthenticatorManager.tsx — list, remove + add the user's TOTP authenticators
 *
 * Auth:   the active session is already AAL2 on the dashboard, so auth.mfa.unenroll is permitted.
 * Data:   supabase.auth.mfa.listFactors() (totp); auth.mfa.unenroll({ factorId }); enrol via /enrol-totp.
 * Notes:  Rendered in Settings → Security (Password & 2FA tab) beside PasskeyManager. Warns before removing
 *         the only verified authenticator. Same list/divider grammar as PasskeyManager.
 */
import { useState, useEffect } from "react"
import Link from "next/link"
import { Smartphone, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { RemoveButton } from "@/components/ui/actions"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"

interface TotpFactor { id: string; friendly_name: string | null; status: string }

export function AuthenticatorManager() {
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.mfa.listFactors()
      .then(({ data }) => setFactors((data?.totp ?? []).map((f) => ({ id: f.id, friendly_name: f.friendly_name ?? null, status: f.status }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const verified = factors.filter((f) => f.status === "verified")
  const isLast = !!confirmId && verified.length <= 1 && verified.some((f) => f.id === confirmId)

  async function doRevoke() {
    const id = confirmId
    if (!id) return
    setRevoking(true)
    const { error } = await createClient().auth.mfa.unenroll({ factorId: id })
    setRevoking(false)
    setConfirmId(null)
    if (error) { toast.error(error.message); return }
    toast.success("Authenticator removed")
    setFactors((prev) => prev.filter((f) => f.id !== id))
  }

  function renderList() {
    if (loading) {
      return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
    }
    if (factors.length === 0) {
      return (
        <div className="flex items-start gap-4 p-4">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">No authenticator enrolled</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Use an app like Google Authenticator or 1Password for time-based codes.</div>
          </div>
        </div>
      )
    }
    return factors.map((f, i) => (
      <div key={f.id} className="flex items-start gap-4 p-4">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{f.friendly_name || `Authenticator ${i + 1}`}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {f.status === "verified"
              ? <span className="text-success">Active</span>
              : <span className="text-amber-600 dark:text-amber-400">Pending verification</span>}
          </div>
        </div>
        <RemoveButton mode="label" label="Remove" onClick={() => setConfirmId(f.id)} disabled={revoking} />
      </div>
    ))
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Authenticator app</h2>
      <div className="divide-y divide-border rounded-[var(--r-button)] border border-border">
        {renderList()}
        <div className="p-4">
          <Link href="/settings/security/enrol-totp" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {factors.length === 0 ? "Set up an authenticator" : "Add another authenticator"}
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null) }}
        title="Remove authenticator?"
        description={isLast
          ? "This is your only authenticator. Removing it drops this two-factor method — make sure you have a passkey or can re-enrol."
          : "This authenticator will no longer generate sign-in codes."}
        variant="destructive"
        confirmLabel="Remove"
        onConfirm={doRevoke}
        loading={revoking}
      />
    </section>
  )
}
