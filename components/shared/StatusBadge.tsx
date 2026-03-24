"use client"

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
}

const variantStyles = {
  green: "bg-success-bg text-success border-success/20",
  amber: "bg-warning-bg text-warning border-warning/20",
  red: "bg-danger-bg text-danger border-danger/20",
  blue: "bg-info-bg text-info border-info/20",
  purple: "bg-purple-950 text-purple-400 border-purple-400/20",
  gray: "bg-muted text-muted-foreground border-border",
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <Badge variant="outline" className={cn("font-medium", variantStyles[config.variant], className)}>
      {config.label}
    </Badge>
  )
}
