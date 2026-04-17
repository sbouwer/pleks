"use client"

import { useWizard } from "../WizardContext"

export function StepSummary() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Review &amp; save</h2>
      <p className="text-muted-foreground text-sm">
        Summary review and property creation coming in Phase 13.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded overflow-auto max-h-96">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  )
}
