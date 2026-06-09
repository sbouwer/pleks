"use client"

/**
 * components/ui/WarningBell.tsx — compact danger icon with a count badge (shared)
 *
 * Notes:  The "needs attention" affordance — a danger triangle + count badge that opens a details modal on
 *         click, with the full label on hover. Used in the calendar header (overdue items) and on list
 *         pages that surface warnings (e.g. expiring/expired leases). Renders nothing when count is 0.
 *         Default height matches an h-11 header action; pass `className` to resize.
 */
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export function WarningBell({
  count, label, onClick, className,
}: Readonly<{ count: number; label: string; onClick: () => void; className?: string }>) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--r-button)] border border-danger/40 bg-danger/5 text-danger transition-colors hover:bg-danger/10",
        className,
      )}
    >
      <AlertTriangle className="size-4" />
      <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
        {count}
      </span>
    </button>
  )
}
