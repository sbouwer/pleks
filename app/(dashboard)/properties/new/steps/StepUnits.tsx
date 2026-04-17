"use client"

import { useWizard } from "../WizardContext"

export function StepUnits() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Name your units</h2>
      <p className="text-muted-foreground text-sm">
        Unit label editor coming in Phase 10.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ unitCount: state.unitCount, unitLabels: state.unitLabels }, null, 2)}
      </pre>
    </div>
  )
}
