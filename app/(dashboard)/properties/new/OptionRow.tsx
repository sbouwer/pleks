"use client"

/**
 * app/(dashboard)/properties/new/OptionRow.tsx — Compact radio-style option row for wizard steps
 *
 * Notes:  Single line; if `sub` is provided, an info icon reveals it as a hover/focus TOOLTIP
 *         (B6 — was click-to-expand, which read as tiny hidden text). Keyboard-accessible via the
 *         tooltip trigger's focus. Used in StepInsurance / StepLandlord / StepOperatingHours /
 *         StepScenarioFollowUp.
 */
import { Check, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

interface OptionRowProps {
  selected:  boolean
  onSelect:  () => void
  label:     string
  sub?:      string
  disabled?: boolean
}

export function OptionRow({ selected, onSelect, label, sub, disabled }: Readonly<OptionRowProps>) {
  const hasSub = !!sub

  return (
    <div
      className={cn(
        "rounded-[var(--r-button)] border transition-colors",
        disabled && "opacity-50",
        !disabled && (selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border hover:border-primary/40 hover:bg-muted/30"),
      )}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={onSelect}
          disabled={disabled}
          className="flex flex-1 min-w-0 items-start gap-2 text-left disabled:cursor-not-allowed"
        >
          <span
            aria-hidden
            className={cn(
              "flex items-center justify-center w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30",
            )}
          >
            {selected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
          </span>
          <span className="text-sm font-medium leading-snug break-words min-w-0">{label}</span>
        </button>

        {hasSub && (
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger
                aria-label="More details"
                className="rounded-full p-0.5 mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Info className="w-3.5 h-3.5 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs leading-relaxed">
                {sub}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}
