/**
 * app/(dashboard)/listings/[slug]/listings/[slug]/applications/[id]/_components/FitScorePdfDownload.tsx — Stream 2 PDF download trigger
 *
 * Auth:   agent workspace (client component — auth enforced by the API route)
 * Data:   fetches /api/screening/[id]/fitscore-pdf
 * Notes:  Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7.
 */
"use client"

import { useState } from "react"
import { toast } from "sonner"

interface Props {
  applicationId: string
}

export function FitScorePdfDownload({ applicationId }: Readonly<Props>) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch(`/api/screening/${applicationId}/fitscore-pdf`)
      if (!res.ok) {
        const text = await res.text()
        toast.error(text || 'PDF generation failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Pleks-FitScore-${applicationId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? 'Generating…' : 'Download Stream 2 PDF'}
    </button>
  )
}
