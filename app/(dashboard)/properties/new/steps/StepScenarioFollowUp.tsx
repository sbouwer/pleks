"use client"

import { useWizard } from "../WizardContext"

export function StepScenarioFollowUp() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">A bit more about your property</h2>
      <p className="text-muted-foreground text-sm">
        Scenario-specific questions for{" "}
        <strong>{state.scenarioType ?? "—"}</strong> coming in Phase 7.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ scenarioAnswers: state.scenarioAnswers }, null, 2)}
      </pre>
    </div>
  )
}
