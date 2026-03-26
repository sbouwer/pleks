"use client"

export function WizardStepBar({ currentStep, totalSteps }: Readonly<{ currentStep: number; totalSteps: number }>) {
  const progress = Math.max(0, Math.min(100, (currentStep / totalSteps) * 100))

  return (
    <div className="mb-6">
      <div className="h-1 bg-border/50 rounded-full overflow-hidden">
        <div className="h-full bg-brand transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-right">
        Step {currentStep} of {totalSteps}
      </p>
    </div>
  )
}
