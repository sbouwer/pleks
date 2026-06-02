"use client"

/**
 * components/properties/GuidedSetupLink.tsx — dashboard "start guided setup" launcher
 *
 * Notes:  Text-link styled trigger (matching the dashboard setup card) that opens the property wizard
 *         modal in place over the dashboard, rather than navigating to /properties/new. Save navigates
 *         to the new property; close returns to the dashboard.
 */
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { PropertyWizardModal } from "@/app/(dashboard)/properties/new/PropertyWizardModal"

export function GuidedSetupLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Start guided setup
        <ArrowRight className="w-4 h-4" />
      </button>
      <PropertyWizardModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
