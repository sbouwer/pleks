/**
 * app/(dashboard)/settings/privacy/data-subject-requests/[id]/reject/page.tsx — Rejection form
 *
 * Route:  /settings/privacy/data-subject-requests/:id/reject
 * Auth:   gatewaySSR() — org member; request must belong to org
 * Data:   POST /api/popia/request/:id/reject
 * Notes:  D-POPIA-04: requires notes + legal basis. Subject notified with IR path.
 */
"use client"

import { useRouter, useParams } from "next/navigation"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, XCircle } from "lucide-react"

const REJECTION_BASES = [
  { value: "s24_1_b_legal_obligation", label: "s24(1)(b) — legal retention obligation prevents deletion" },
  { value: "s11_1_c_legitimate_interest", label: "s11(1)(c) — legitimate interest: data still required" },
  { value: "identity_not_verified", label: "Identity could not be verified" },
  { value: "inaccuracy_claim_not_substantiated", label: "Inaccuracy claim is not substantiated by evidence" },
  { value: "duplicate_request", label: "Duplicate of a previously resolved request" },
  { value: "outside_scope", label: "Request outside the scope of data held by this agency" },
]

export default function RejectRequestPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [basis, setBasis] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!basis || !notes.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/popia/request/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, legal_basis: basis }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Failed to reject request")
      }

      router.push(`/settings/privacy/data-subject-requests/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => router.back()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">Reject request</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Legal basis for rejection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {REJECTION_BASES.map(({ value, label }) => (
            <label key={value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="basis"
                value={value}
                checked={basis === value}
                onChange={() => setBasis(value)}
                className="mt-0.5"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="notes">
          Resolution notes <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="notes"
          placeholder="Explain why this request cannot be fulfilled and what the subject can do next..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-none"
          rows={5}
        />
        <p className="text-xs text-muted-foreground">
          These notes will be shared with the subject in the rejection email.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleSubmit}
          disabled={!basis || !notes.trim() || submitting}
          className="flex-1"
        >
          <XCircle className="size-4 mr-2" />
          {submitting ? "Rejecting..." : "Reject request"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The subject will be notified by email with your rejection notes and the Information
        Regulator escalation path (complaints.IR@justice.gov.za · +27 10 023 5207).
      </p>
    </div>
  )
}
