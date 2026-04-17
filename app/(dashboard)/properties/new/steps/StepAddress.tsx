"use client"

import { useWizard } from "../WizardContext"

export function StepAddress() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Where is the property?</h2>
      <p className="text-muted-foreground text-sm">
        Google Places address lookup coming in Phase 5.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ address: state.address }, null, 2)}
      </pre>
    </div>
  )
}
