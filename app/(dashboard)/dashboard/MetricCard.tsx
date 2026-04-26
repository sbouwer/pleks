import Link from "next/link"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  subtextVariant?: "default" | "success" | "warning" | "danger"
  progressBar?: number // 0-100
  href?: string
  className?: string
  dotColor?: string
}

const subtextColors = {
  default: "text-muted-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
}

export function MetricCard({
  label,
  value,
  subtext,
  subtextVariant = "default",
  progressBar,
  href,
  className,
  dotColor,
}: Readonly<MetricCardProps>) {
  const inner = (
    <div className="flex h-full flex-col gap-2.5 p-5 transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor ?? "var(--color-amber-400, #FBBF24)" }}
        />
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="font-heading text-[26px] leading-none tracking-tight tabular-nums">{value}</p>
      <div className="min-h-4">
        {progressBar !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
            />
          </div>
        )}
        {subtext && (
          <p className={`text-[11px] font-medium ${subtextColors[subtextVariant]}`}>{subtext}</p>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className={cn("block", className)}>
        {inner}
      </Link>
    )
  }
  return <div className={className}>{inner}</div>
}
