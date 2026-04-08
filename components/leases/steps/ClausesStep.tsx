"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

export function ClausesStep({ data, onBack, onNext }: Readonly<Props>) {
  const [clauseSelections, setClauseSelections] = useState<Record<string, boolean>>(data.clauseSelections)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Lease clauses</h2>
        <p className="text-sm text-muted-foreground">Review and configure which clauses apply to this lease.</p>
      </div>

      <ClauseConfigurator
        leaseType={data.leaseType}
        unitId={data.unitId}
        onSelectionsChange={setClauseSelections}
      />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={() => onNext({ clauseSelections })}>Continue →</Button>
      </div>
    </div>
  )
}
