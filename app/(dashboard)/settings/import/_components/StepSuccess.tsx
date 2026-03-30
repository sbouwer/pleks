"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Building2 } from "lucide-react"
import Link from "next/link"
import type { ImportResultData } from "../page"

interface StepSuccessProps {
  result: ImportResultData
  onReset: () => void
}

export function StepSuccess({ result, onReset }: Readonly<StepSuccessProps>) {
  const [showErrors, setShowErrors] = useState(false)
  const hasRecords = result.created.tenants > 0 || result.created.units > 0 || result.created.leases > 0
    || (result.created.contractors ?? 0) > 0 || (result.created.landlords ?? 0) > 0 || (result.created.agentInvites ?? 0) > 0
  const hasErrors = result.errors.length > 0

  function getHeading() {
    if (!hasRecords) return "Import completed with errors"
    if (result.created.units > 0) return "Portfolio imported"
    return "Contacts imported"
  }

  // Build summary lines
  const summaryParts: string[] = []
  if (result.created.tenants > 0) summaryParts.push(`${result.created.tenants} tenant${result.created.tenants === 1 ? "" : "s"}`)
  if ((result.created.contractors ?? 0) > 0) summaryParts.push(`${result.created.contractors} contractor${result.created.contractors === 1 ? "" : "s"}`)
  if ((result.created.landlords ?? 0) > 0) summaryParts.push(`${result.created.landlords} landlord${result.created.landlords === 1 ? "" : "s"}`)
  if ((result.created.agentInvites ?? 0) > 0) summaryParts.push(`${result.created.agentInvites} team invite${result.created.agentInvites === 1 ? "" : "s"}`)
  if (result.created.units > 0) summaryParts.push(`${result.created.units} unit${result.created.units === 1 ? "" : "s"}`)
  if (result.created.leases > 0) summaryParts.push(`${result.created.leases} lease${result.created.leases === 1 ? "" : "s"}`)

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${hasRecords ? "bg-green-500/10" : "bg-amber-500/10"}`}>
        {hasRecords ? <CheckCircle2 className="size-8 text-green-500" /> : <AlertTriangle className="size-8 text-amber-500" />}
      </div>

      <h2 className="font-heading text-2xl mb-2">{getHeading()}</h2>
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

      {/* Error log */}
      {hasErrors && (
        <Card className="mb-6 text-left border-amber-500/20">
          <CardContent className="pt-4">
            <button type="button" onClick={() => setShowErrors(!showErrors)} className="flex items-center gap-2 text-sm text-amber-500 w-full">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{result.errors.length} row{result.errors.length === 1 ? "" : "s"} had errors</span>
              {showErrors ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
            </button>
            {showErrors && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <div key={`err-${i}`} className="text-xs border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">Row {err.row ?? i + 1}:</span>{" "}
                    <span className="text-foreground">{err.error ?? err.message ?? JSON.stringify(err)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Button render={<Link href="/dashboard" />}>View dashboard</Button>
        <Button variant="outline" onClick={onReset}>Import another file</Button>
      </div>
    </div>
  )
}
