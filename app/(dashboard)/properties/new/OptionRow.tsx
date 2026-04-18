"use client"

import { useState } from "react"
import { Check, Info, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Compact option row used across wizard steps for radio-style picks.
 * Single-line by default; if `sub` is provided, an info icon reveals it
 * below on click — keeps the wizard short while preserving explanations.
 */
interface OptionRowProps {
  selected:  boolean
  onSelect:  () => void
  label:     string
  sub?:      string
  disabled?: boolean
}

export function OptionRow({ selected, onSelect, label, sub, disabled }: Readonly<OptionRowProps>) {
  const [open, setOpen] = useState(false)
  const hasSub = !!sub

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        disabled && "opacity-50",
        !disabled && (selected
          ? "border-primary bg-primary/[0.04]"
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
          <button
            type="button"
            aria-label={open ? "Hide details" : "Show details"}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
            className={cn(
              "rounded-full p-0.5 mt-0.5 transition-colors shrink-0",
              open
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-primary hover:bg-primary/10",
            )}
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {hasSub && open && (
        <p className="px-2.5 pb-2 pl-8 text-xs text-muted-foreground leading-relaxed">
          {sub}
        </p>
      )}
    </div>
  )
}
