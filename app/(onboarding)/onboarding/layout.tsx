"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Image from "next/image"

const steps = [
  { path: "/onboarding", label: "Organisation" },
  { path: "/onboarding/receivables", label: "Portfolio" },
  { path: "/onboarding/trust", label: "Compliance" },
  { path: "/onboarding/team", label: "Plan & Team" },
]

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const currentStep = steps.findIndex((s) => s.path === pathname)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Image src="/logo.svg" alt="Pleks" width={86} height={24} />
            <span className="text-xs text-muted-foreground">Setup</span>
          </div>
          <div className="flex gap-2">
            {steps.map((step, i) => (
              <div key={step.path} className="flex-1">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    i <= currentStep ? "bg-brand" : "bg-border"
                  )}
                />
                <p
                  className={cn(
                    "text-xs mt-1",
                    i <= currentStep ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  )
}
