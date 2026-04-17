"use client"

import { useWizard } from "../WizardContext"

export function StepInsurance() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Insurance details</h2>
      <p className="text-muted-foreground text-sm">
        Insurance stub form coming in Phase 11.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ insurance: state.insurance }, null, 2)}
      </pre>
    </div>
  )
}
