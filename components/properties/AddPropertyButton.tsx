"use client"

/**
 * components/properties/AddPropertyButton.tsx — opens the property wizard modal in place
 *
 * Notes:  The "launched from the page" entry point: instead of navigating to /properties/new, this
 *         opens the PropertyWizardModal over the current page so the list/empty-state stays behind the
 *         dimmed door. Mockup button grammar — dark fill + amber accent bar + light text. Reused by the
 *         empty state and the list headers. (/properties/new still works as a deep-link launcher.)
 */
import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-[var(--r-button)] bg-foreground font-semibold text-background transition hover:brightness-110",
          variant === "hero" ? "px-5 py-3 text-sm" : "px-4 py-2.5 text-sm",
          className,
        )}
      >
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary" />
        {showPlus && <Plus className="h-4 w-4" strokeWidth={2.2} />}
        {label}
      </button>
      <PropertyWizardModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
