/**
 * app/(dashboard)/applications/[id]/_components/IdReveal.tsx — ID number reveal with audit log
 *
 * Auth:   agent workspace (client component — server action enforces org gate)
 * Data:   revealIdNumber server action (decrypts + logs)
 * Notes:  Shown only when id_number is present. Once revealed, stays visible until page refresh.
 *         Capability gate (can_view_sensitive_identity_data) will land in Phase G.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.7, §10.7.
 */
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { revealIdNumber } from "../_actions"

interface Props {
  applicationId: string
  idType: string | null
  hasIdNumber: boolean
}

export function IdReveal({ applicationId, idType, hasIdNumber }: Readonly<Props>) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!hasIdNumber) return null

  async function handleReveal() {
    setLoading(true)
    try {
      const result = await revealIdNumber(applicationId)
      if (result.error) {
        toast.error(result.error)
      } else {
        setRevealed(result.value ?? '—')
      }
    } finally {
      setLoading(false)
    }
  }

  const ID_LABELS: Record<string, string> = { sa_id: 'ID number', passport: 'Passport number' }
  const label = (idType && ID_LABELS[idType]) ?? 'ID / document number'

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {revealed !== null ? (
        <span className="font-mono text-sm">{revealed}</span>
      ) : (
        <button
          onClick={handleReveal}
          disabled={loading}
          className="text-xs text-brand underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Reveal (logged)'}
        </button>
      )}
    </div>
  )
}
