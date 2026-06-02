"use client"

/**
 * components/ui/add-button.tsx — the primary "add a …" button (mockup grammar)
 *
 * Notes:  Dark fill + amber accent bar + light text, square-slight radius — the same primary used in
 *         the wizard footer. Presentational only (takes onClick); page launchers (AddPropertyButton,
 *         the party pages) wrap it with their own modal/navigation. `variant="hero"` is the larger
 *         empty-state CTA; `showPlus` toggles the leading +.
 */
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export function AddButton({
  label, onClick, variant = "default", showPlus = true, className,
}: Readonly<{
  label:     string
  onClick:   () => void
  variant?:  "default" | "hero"
  showPlus?: boolean
  className?: string
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-[var(--r-button)] font-semibold transition-colors",
        // normal: dark fill + light text + amber bar · hover: amber fill + dark text + dark bar
        "bg-foreground text-background hover:bg-primary hover:text-primary-foreground",
        variant === "hero" ? "px-5 py-3 text-sm" : "px-4 py-2.5 text-sm",
        className,
      )}
    >
      <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
      {showPlus && <Plus className="h-4 w-4" strokeWidth={2.2} />}
      {label}
    </button>
  )
}
