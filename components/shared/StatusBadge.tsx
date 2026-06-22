"use client"

/**
 * components/shared/StatusBadge.tsx — the global status pill (solid, readable in light + dark)
 *
 * Notes:  ONE status pill for the whole app — map a domain status string to a colour variant here and
 *         render <StatusBadge status={...} />. Solid saturated bg + white text (was soft tint-on-tint,
 *         which washed out in light mode). Used across billing, arrears, invoices, inspections,
 *         applications, leases, suppliers, etc. — add new statuses to the union + statusConfig, not
 *         per-page maps. Unknown status → renders nothing (caller should pass a mapped status).
 */
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Status =
  | "active"
  | "paid"
  | "completed"
  | "resolved"
  | "pending"
  | "in_progress"
  | "review"
  | "arrears"
  | "failed"
  | "overdue"
  | "scheduled"
  | "open"
  | "submitted"
  | "notice"
  | "expiring"
  | "draft"
  | "cancelled"
  | "inactive"
  // lease-specific
  | "month_to_month"
  | "pending_signing"
  | "expired"
  // listing-specific
  | "paused"
  | "filled"

const statusConfig: Record<Status, { label: string; variant: "green" | "amber" | "red" | "blue" | "purple" | "gray" }> = {
  active: { label: "Active", variant: "green" },
  paid: { label: "Paid", variant: "green" },
  completed: { label: "Completed", variant: "green" },
  resolved: { label: "Resolved", variant: "green" },
  pending: { label: "Pending", variant: "amber" },
  in_progress: { label: "In Progress", variant: "amber" },
  review: { label: "Review", variant: "amber" },
  arrears: { label: "Arrears", variant: "red" },
  failed: { label: "Failed", variant: "red" },
  overdue: { label: "Overdue", variant: "red" },
  scheduled: { label: "Scheduled", variant: "blue" },
  open: { label: "Open", variant: "blue" },
  submitted: { label: "Submitted", variant: "blue" },
  notice: { label: "Notice", variant: "purple" },
  expiring: { label: "Expiring", variant: "purple" },
  draft: { label: "Draft", variant: "gray" },
  cancelled: { label: "Cancelled", variant: "gray" },
  inactive: { label: "Inactive", variant: "gray" },
  month_to_month: { label: "MTM", variant: "green" },
  pending_signing: { label: "Pending", variant: "amber" },
  expired: { label: "Expired", variant: "red" },
  paused: { label: "Paused", variant: "gray" },
  filled: { label: "Filled", variant: "green" },
}

// Solid saturated bg + white text — readable in light AND dark (the soft tint-on-tint variants washed
// out in light mode). Border-transparent so the Badge `outline` base border doesn't show.
const variantStyles = {
  green: "bg-emerald-600 text-white border-transparent",
  amber: "bg-amber-500 text-white border-transparent",
  red: "bg-red-600 text-white border-transparent",
  blue: "bg-blue-600 text-white border-transparent",
  purple: "bg-purple-600 text-white border-transparent",
  gray: "bg-slate-600 text-white border-transparent",
}

export function StatusBadge({ status, className }: Readonly<{ status: string; className?: string }>) {
  const config = statusConfig[status as Status]
  if (!config) return null

  return (
    <Badge variant="outline" className={cn("font-medium", variantStyles[config.variant], className)}>
      {config.label}
    </Badge>
  )
}
