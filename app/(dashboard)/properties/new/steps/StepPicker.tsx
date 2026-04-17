"use client"

import { useWizard } from "../WizardContext"

export function StepPicker() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">What type of property are you adding?</h2>
      <p className="text-muted-foreground text-sm">
        Scenario picker coming in Phase 4.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ scenarioType: state.scenarioType, managedMode: state.managedMode, unitCount: state.unitCount }, null, 2)}
      </pre>
    </div>
  )
}
