import Link from "next/link"
import { relativeTime, type ActivityItem } from "@/lib/dashboard/activityFeed"

interface ActivityFeedProps {
  items: ActivityItem[]
}

export function ActivityFeed({ items }: Readonly<ActivityFeedProps>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-0.5 w-4 shrink-0 bg-amber-400"></span>
          {"Recent activity"}
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No recent activity. Payments, lease changes, and maintenance updates will appear here.
          </p>
        </div>
      ) : (
        <ul>
          {items.map((item, i) => {
            const inner = (
              <div className="grid grid-cols-[40px_1fr_auto] items-start gap-2.5 px-5 py-2.5 transition-colors hover:bg-muted/20">
                <span className="pt-0.5 font-mono text-[11px] text-muted-foreground/50">
                  #{String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-snug">
                    <span
                      className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ backgroundColor: item.dotColor }}
                    />
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </p>
                  )}
                </div>
                <span className="shrink-0 pt-0.5 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
            )

            return (
              <li key={item.id} className="border-b border-border last:border-b-0">
                {item.href ? <Link href={item.href}>{inner}</Link> : inner}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
