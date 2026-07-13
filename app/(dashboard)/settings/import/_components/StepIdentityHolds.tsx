/**
 * app/(dashboard)/settings/import/_components/StepIdentityHolds.tsx — "is this the same person?"
 *
 * Route:  /settings/import (wizard step, shown only when the import held rows)
 * Auth:   dashboard session (the wizard's own gate)
 * Data:   ImportResult.identityHolds from /api/import/execute; answers go back to the same route
 * Notes:  The importer will not merge two identities on a resemblance. Where an exact key matches (SA ID, CIPC,
 *         VAT, email) it links silently. Where only the NAME AND PHONE match, it HOLDS the row — it does not
 *         import it, and it does not duplicate it — and asks here.
 *
 *         Why this screen must be blunt: a held row is a row the agency does not have. With a hundred leases
 *         you would not notice one missing until it was far too late, so this says, in plain words, what is
 *         missing and what it costs. "3 records were NOT imported."
 *
 *         And why the questions must be FEW: a screen that asks about every "John Smith" trains the agent to
 *         click "different person" without reading, which launders duplicates through a human who has stopped
 *         paying attention — worse than not asking at all. The matcher's band is deliberately narrow so that a
 *         hold stays rare enough to be worth reading. If this screen ever gets long, the band is wrong, not the
 *         screen.
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export interface IdentityHold {
  rowIndex: number
  role: string
  incoming: { name: string; email: string | null }
  match: { contactId: string; name: string; email: string | null; confidence: number; basis: string }
}

export type IdentityAnswer = { action: "link"; contactId: string } | { action: "create" }

const WHY: Record<string, string> = {
  name_and_phone: "the same name and phone number, but a different email address",
  phone: "the same phone number",
  name: "the same name",
  email: "the same email address",
  company_name: "exactly the same company name",
  id_number: "the same ID number",
  registration_number: "the same company registration number",
  vat_number: "the same VAT number",
}

const ROLE: Record<string, string> = {
  tenant: "tenant",
  landlord: "owner",
  contractor: "supplier",
  agent: "team member",
}

export function StepIdentityHolds({
  holds,
  onResolve,
  onSkip,
  loading,
}: {
  holds: IdentityHold[]
  onResolve: (answers: Record<number, IdentityAnswer>) => void
  onSkip: () => void
  loading: boolean
}) {
  const [answers, setAnswers] = useState<Record<number, IdentityAnswer>>({})
  const answered = Object.keys(answers).length
  const allAnswered = answered === holds.length

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">
        {holds.length} {holds.length === 1 ? "record was" : "records were"} not imported
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {holds.length === 1 ? "This one looks" : "These look"} like {holds.length === 1 ? "someone" : "people"} you
        already have — but we are not certain, and we will not merge two people on a resemblance. Tell us which,
        and we will finish the import. {holds.length === 1 ? "It stays out" : "They stay out"} until you do.
      </p>

      <div className="space-y-4">
        {holds.map((h) => {
          const answer = answers[h.rowIndex]
          const role = ROLE[h.role] ?? h.role
          return (
            <Card key={h.rowIndex} className="p-4">
              <div className="text-xs text-muted-foreground mb-3">
                Row {h.rowIndex + 1} of your file · {role} · they share {WHY[h.match.basis] ?? h.match.basis}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">In your file</div>
                  <div className="font-medium">{h.incoming.name}</div>
                  <div className="text-sm text-muted-foreground">{h.incoming.email ?? "no email"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Already in Pleks</div>
                  <div className="font-medium">{h.match.name}</div>
                  <div className="text-sm text-muted-foreground">{h.match.email ?? "no email"}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={answer?.action === "link" ? "default" : "outline"}
                  onClick={() =>
                    setAnswers((a) => ({ ...a, [h.rowIndex]: { action: "link", contactId: h.match.contactId } }))
                  }
                >
                  Same {role} — use the one we have
                </Button>
                <Button
                  size="sm"
                  variant={answer?.action === "create" ? "default" : "outline"}
                  onClick={() => setAnswers((a) => ({ ...a, [h.rowIndex]: { action: "create" } }))}
                >
                  Different {role} — add them
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => onResolve(answers)} disabled={!allAnswered || loading}>
          {loading ? "Finishing the import…" : `Finish the import (${answered}/${holds.length} answered)`}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={loading}>
          Leave them out for now
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Everything else in your file has already imported — this only affects the{" "}
        {holds.length === 1 ? "row" : `${holds.length} rows`} above. Leaving them out is safe: nothing is
        duplicated, and you can import them later.
      </p>
    </div>
  )
}
