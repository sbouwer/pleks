/**
 * app/(dashboard)/dashboard/AttentionQueue.tsx — Dashboard needs-attention queue: priority-sorted items needing agent action
 *
 * Route:  /dashboard (embedded)
 * Auth:   gateway-protected dashboard layout
 * Data:   AttentionItem[] passed from server; items sourced from arrears, expiring leases, open maintenance
 */
import { InlineLink } from "@/components/ui/actions"
import type { AttentionItem } from "@/lib/dashboard/attentionItems"

interface AttentionQueueProps {
  items: AttentionItem[]
}

const priorityBullet: Record<number, string> = {
  1: "bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68/0.15)]",
  2: "bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.15)]",
  3: "bg-slate-400 shadow-[0_0_0_3px_rgb(100_116_139/0.15)]",
}

const badgeVariant: Record<string, string> = {
  red:   "border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-400",
  amber: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-400",
  blue:  "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400",
  green: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-400",
}

export function AttentionQueue({ items }: Readonly<AttentionQueueProps>) {
  return (
    <div className="overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
          Needs attention
          {items.length > 0 && (
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {items.length}
            </span>
          )}
        </h2>
        <InlineLink href="/payments/arrears" withArrow>View all</InlineLink>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now.</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20">
                <div
                  className={`h-2 w-2 rounded-full ${priorityBullet[item.priority] ?? priorityBullet[3]}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium leading-snug">{item.title}</p>
                  <p className="truncate font-mono text-[11.5px] text-muted-foreground">{item.subtitle}</p>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${badgeVariant[item.badge.variant] ?? badgeVariant.blue}`}
                >
                  {item.badge.text}
                </span>
                <InlineLink href={item.href} withArrow className="shrink-0">Review</InlineLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
