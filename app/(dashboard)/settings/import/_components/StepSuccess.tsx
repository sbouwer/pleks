"use client"

/**
 * app/(dashboard)/settings/import/_components/StepSuccess.tsx — Success screen after tenant/lease/contact import completes
 *
 * Route:  /settings/import (final step of tenant/lease import wizard)
 * Auth:   gateway (dashboard layout)
 * Data:   ImportResultData passed as prop from Step4Confirm after successful POST
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type { ImportResultData } from "../page"

interface StepSuccessProps {
  result: ImportResultData
  onReset: () => void
}

type CreatedCounts = ImportResultData["created"]

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

function buildSummaryParts(created: CreatedCounts): string[] {
  const parts: string[] = []
  if (created.tenants > 0) parts.push(plural(created.tenants, "tenant"))
  if ((created.contractors ?? 0) > 0) parts.push(plural(created.contractors!, "contractor"))
  if ((created.landlords ?? 0) > 0) parts.push(plural(created.landlords!, "landlord"))
  if ((created.agentInvites ?? 0) > 0) parts.push(plural(created.agentInvites!, "team invite"))
  if (created.units > 0) parts.push(plural(created.units, "unit"))
  if (created.leases > 0) parts.push(plural(created.leases, "lease"))
  if ((created.bankAccounts ?? 0) > 0) parts.push(plural(created.bankAccounts!, "bank account"))
  return parts
}

function hasAnyRecords(created: CreatedCounts): boolean {
  return created.tenants > 0 || created.units > 0 || created.leases > 0
    || (created.contractors ?? 0) > 0 || (created.landlords ?? 0) > 0 || (created.agentInvites ?? 0) > 0
}

function getHeading(hasRecords: boolean, units: number, refusalCount: number): string {
  if (!hasRecords) return "Import completed with errors"
  // A clean green "Portfolio imported" over rows that were rejected is the worst of both: the agency believes
  // its book migrated. Name the rejection in the heading.
  if (refusalCount > 0) return `Imported — ${refusalCount} row${refusalCount === 1 ? "" : "s"} rejected`
  if (units > 0) return "Portfolio imported"
  return "Contacts imported"
}

export function StepSuccess({ result, onReset }: Readonly<StepSuccessProps>) {
  const router = useRouter()
  const [showErrors, setShowErrors] = useState(false)
  const hasRecords = hasAnyRecords(result.created)
  const hasErrors = result.errors.length > 0
  const summaryParts = buildSummaryParts(result.created)

  // A refusal is not a warning: the row DID NOT import. Keep them apart so a "Portfolio imported" tick can
  // never sit above six silently-dropped leases.
  const refusals = result.errors.filter((e) => e.severity === "error")
  const warnings = result.errors.filter((e) => e.severity !== "error")
  const clean = hasRecords && refusals.length === 0

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${clean ? "bg-green-500/10" : "bg-amber-500/10"}`}>
        {clean ? <CheckCircle2 className="size-8 text-green-500" /> : <AlertTriangle className="size-8 text-amber-500" />}
      </div>

      <h2 className="font-heading text-2xl mb-2">{getHeading(hasRecords, result.created.units, refusals.length)}</h2>
      <p className="text-muted-foreground text-sm mb-6">
        {summaryParts.length > 0 ? summaryParts.join(" · ") : "0 records created"}
      </p>

      {result.skipped > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {result.skipped} row{result.skipped === 1 ? "" : "s"} skipped
        </p>
      )}

      {/* Pending landlord linking */}
      {result.pendingLandlordLinks && result.pendingLandlordLinks.length > 0 && (
        <Card className="mb-6 text-left">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-brand" />
              <p className="text-sm font-medium">Link landlords to properties ({result.pendingLandlordLinks.length})</p>
            </div>
            <p className="text-xs text-muted-foreground">
              These property owners were imported. Link each one to their property to complete the setup.
              You can also do this later from the Properties page.
            </p>
            {result.pendingLandlordLinks.map((ll) => (
              <div key={ll.pendingLandlordId} className="flex items-center gap-2 text-sm">
                <span className="shrink-0">{ll.name || ll.email}</span>
                <span className="text-xs text-muted-foreground">{ll.email}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agent invites */}
      {result.agentInvites && result.agentInvites.length > 0 && (
        <Card className="mb-6 text-left">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium">Team invites sent ({result.agentInvites.length})</p>
            <p className="text-xs text-muted-foreground">
              Invite emails will be sent to these team members. Invites expire in 7 days.
            </p>
            {result.agentInvites.map((inv) => (
              <div key={inv.email} className="flex items-center gap-2 text-xs">
                <span>{inv.email}</span>
                <span className="text-muted-foreground">({inv.role})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error log. A REFUSAL (severity "error" — the row did not import) must never look like an FYI: it is
          data the agency expected to migrate and did not. Refusals are counted and listed first, in danger
          tone; warnings follow. Every line names its real row and the column at fault. */}
      {hasErrors && (
        <Card className={`mb-6 text-left ${refusals.length > 0 ? "border-danger/30" : "border-amber-500/20"}`}>
          <CardContent className="pt-4">
            <button
              type="button"
              onClick={() => setShowErrors(!showErrors)}
              className={`flex items-center gap-2 text-sm w-full ${refusals.length > 0 ? "text-danger" : "text-amber-500"}`}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                {refusals.length > 0 && (
                  <>{refusals.length} row{refusals.length === 1 ? "" : "s"} NOT imported</>
                )}
                {refusals.length > 0 && warnings.length > 0 && " · "}
                {warnings.length > 0 && (
                  <>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</>
                )}
              </span>
              {showErrors ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
            </button>

            {refusals.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                These rows were rejected rather than guessed at. Correct them in your file and import it again —
                re-importing is safe and will not duplicate anything already created.
              </p>
            )}

            {showErrors && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {[...refusals, ...warnings].map((err, i) => (
                  <div key={`err-${err.rowIndex}-${err.field}-${i}`} className="text-xs border-b border-border/30 pb-2">
                    <span className={err.severity === "error" ? "text-danger" : "text-amber-500"}>
                      {err.severity === "error" ? "Not imported" : "Warning"}
                    </span>
                    <span className="text-muted-foreground">
                      {" · "}{err.rowIndex >= 0 ? `Row ${err.rowIndex + 1}` : "File"}
                      {err.field ? ` · ${err.field}` : ""}:{" "}
                    </span>
                    <span className="text-foreground">{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <ActionButton tone="primary" onClick={() => router.push("/dashboard")}>View dashboard</ActionButton>
        <ActionButton tone="secondary" onClick={onReset}>Import another file</ActionButton>
      </div>
    </div>
  )
}
