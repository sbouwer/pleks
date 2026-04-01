import Link from "next/link"

interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  subtextVariant?: "default" | "success" | "warning" | "danger"
  progressBar?: number // 0-100
  href?: string
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
}: MetricCardProps) {
  const inner = (
    <div className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-[22px] leading-none">{value}</p>
      {progressBar !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
          />
        </div>
      )}
      {subtext && (
        <p className={`mt-1.5 text-[11px] ${subtextColors[subtextVariant]}`}>{subtext}</p>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}
