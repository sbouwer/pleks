"use client"

/**
 * components/leases/steps/ClausesStep.tsx — step 5 of the lease modal: lease clauses + conflict gate
 *
 * Auth:   client-only; AI conflict check via POST /api/leases/conflict-check
 * Data:   reads/writes WizardData.clauseSelections / acknowledgedConflicts directly via LeaseWizardContext
 * Notes:  Split out of the old merged LeaseDetailsStep (ADDENDUM_LEASE_CREATION_MODAL §1). Clause selections
 *         live in context so the Annexures step's clause-aware checks and the CreateStep payload read the same
 *         set. submit() blocks on unresolved conflicts (the section reports the gate via onBlockedChange).
 *         The Clauses↔Annexures coupling is preserved by ClausesSection reading the live annexureCRules from data.
 */
import { useState } from "react"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { StepHandle } from "../stepHandle"
import { ClausesSection } from "./details/ClausesSection"

interface Props {
  register: (handle: StepHandle) => void
}

export function ClausesStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()
  const [clausesBlocked, setClausesBlocked] = useState(false)
  const [error, setError] = useState("")

  function handleSelections(next: Record<string, boolean>) { patch({ clauseSelections: next }) }
  function handleAcknowledged(next: string[]) { patch({ acknowledgedConflicts: next }) }

  function submit(): boolean {
    if (clausesBlocked) { setError("Resolve or acknowledge all clause conflicts before continuing."); return false }
    setError("")
    return true
  }

  register({ submit })

  return (
    <div className="space-y-6">
      <ClausesSection
        leaseType={data.leaseType}
        unitId={data.unitId}
        isSectionalTitle={data.isSectionalTitle}
        hasSchemeRules={data.hasSchemeRules}
        parkingBays={data.parkingBays}
        annexureCRules={data.annexureCRules}
        clauseSelections={data.clauseSelections}
        acknowledgedConflicts={data.acknowledgedConflicts}
        onChangeSelections={handleSelections}
        onChangeAcknowledged={handleAcknowledged}
        onBlockedChange={setClausesBlocked}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
