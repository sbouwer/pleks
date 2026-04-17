"use client"

import { useWizard } from "../WizardContext"

export function StepUniversal() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">A few quick questions</h2>
      <p className="text-muted-foreground text-sm">
        Universal questions (Wi-Fi, backup power, managing scheme) coming in Phase 6.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ universals: state.universals }, null, 2)}
      </pre>
    </div>
  )
}
