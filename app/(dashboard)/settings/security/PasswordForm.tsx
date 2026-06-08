"use client"

/**
 * app/(dashboard)/settings/security/PasswordForm.tsx — change-password form (Security → Password tab)
 *
 * Auth:   the active session is the auth — Supabase auth.updateUser({ password }) (no separate
 *         current-password step; reset-via-email is the recovery path at /reset-password).
 * Notes:  Canonical field grammar (components/forms/fields). Min 12 chars + confirm match, client-side.
 */
import { useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { ActionButton } from "@/components/ui/actions"
import { FieldGrid, TextField } from "@/components/forms/fields"

export function PasswordForm() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (password.length < 12) { toast.error("Use at least 12 characters"); return }
    if (password !== confirm) { toast.error("Passwords don't match"); return }
    setSaving(true)
    const { error } = await createClient().auth.updateUser({ password })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success("Password updated")
    setPassword("")
    setConfirm("")
  }

  return (
    <div className="max-w-2xl space-y-6">
      <FieldGrid>
        <TextField span label="New password" type="password" value={password} onChange={setPassword} placeholder="At least 12 characters" />
        <TextField span label="Confirm new password" type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" />
      </FieldGrid>
      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <p className="text-xs text-muted-foreground">You&apos;ll stay signed in on this device.</p>
        <ActionButton tone="primary" onClick={save} disabled={saving || !password}>
          {saving ? "Updating…" : "Update password"}
        </ActionButton>
      </div>
    </div>
  )
}
