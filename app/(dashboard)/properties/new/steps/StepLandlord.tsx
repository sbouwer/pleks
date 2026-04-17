"use client"

import { useWizard } from "../WizardContext"

export function StepLandlord() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Who is the property owner?</h2>
      <p className="text-muted-foreground text-sm">
        Owner / landlord selection and creation form coming in Phase 9.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ landlord: state.landlord }, null, 2)}
      </pre>
    </div>
  )
}
