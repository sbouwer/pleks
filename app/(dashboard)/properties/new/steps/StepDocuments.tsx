"use client"

import { useWizard } from "../WizardContext"

export function StepDocuments() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Upload documents</h2>
      <p className="text-muted-foreground text-sm">
        Document upload (title deed, FICA, etc.) coming in Phase 12.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({ documentCount: state.documents.length }, null, 2)}
      </pre>
    </div>
  )
}
