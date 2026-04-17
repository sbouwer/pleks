"use client"

import { useWizard } from "../WizardContext"

export function StepOperatingHours() {
  const { state } = useWizard()
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">Operating hours</h2>
      <p className="text-muted-foreground text-sm">
        Operating hours presets and after-hours access coming in Phase 8.
      </p>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded">
        {JSON.stringify({
          operatingHoursPreset: state.operatingHoursPreset,
          afterHoursAccess:     state.afterHoursAccess,
          afterHoursNoticeHours: state.afterHoursNoticeHours,
        }, null, 2)}
      </pre>
    </div>
  )
}
