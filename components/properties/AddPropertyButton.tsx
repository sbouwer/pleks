"use client"

/**
 * components/properties/AddPropertyButton.tsx — opens the property wizard modal in place
 *
 * Notes:  The "launched from the page" entry point: instead of navigating to /properties/new, this
 *         opens the PropertyWizardModal over the current page so the list/empty-state stays behind the
 *         dimmed door. Uses the shared AddButton grammar. (/properties/new still works as a deep-link.)
 */
import { useState } from "react"
import { AddButton } from "@/components/ui/add-button"
import { PropertyWizardModal } from "@/app/(dashboard)/properties/new/PropertyWizardModal"

export function AddPropertyButton({
  label = "Add property",
  variant = "default",
  showPlus = true,
  className,
}: Readonly<{
  label?: string
  variant?: "default" | "hero"
  showPlus?: boolean
  className?: string
}>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <AddButton label={label} variant={variant} showPlus={showPlus} className={className} onClick={() => setOpen(true)} />
      <PropertyWizardModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
