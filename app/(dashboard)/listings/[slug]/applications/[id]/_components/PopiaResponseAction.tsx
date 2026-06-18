/**
 * app/(dashboard)/listings/[slug]/listings/[slug]/applications/[id]/_components/PopiaResponseAction.tsx
 *
 * Auth:   agent workspace (client component — server action enforces capability gate)
 * Data:   generatePopiaS23Response server action (generates + uploads L2 PDF, returns signed URL)
 * Notes:  Shown only when user holds can_generate_popia_s23; opens signed URL in new tab.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.7, §10.8.
 */
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { generatePopiaS23Response } from "../_actions"

interface Props {
  applicationId: string
  hasCapability: boolean
}

export function PopiaResponseAction({ applicationId, hasCapability }: Readonly<Props>) {
  const [loading, setLoading] = useState(false)

  if (!hasCapability) return (
    <span className="text-xs text-muted-foreground italic">
      POPIA s23 generation requires capability grant
    </span>
  )

  async function handleGenerate() {
    setLoading(true)
    try {
      const result = await generatePopiaS23Response(applicationId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.signedUrl) {
        window.open(result.signedUrl, '_blank', 'noopener,noreferrer')
        const expiry = result.expiresAt
          ? new Date(result.expiresAt).toLocaleString('en-ZA')
          : 'unknown'
        toast.success(`POPIA s23 response generated. Link expires ${expiry}.`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="text-xs text-brand underline underline-offset-2 hover:no-underline disabled:opacity-50"
    >
      {loading ? 'Generating…' : 'Generate POPIA s23 response'}
    </button>
  )
}
