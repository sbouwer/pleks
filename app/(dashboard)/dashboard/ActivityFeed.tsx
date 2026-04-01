import Link from "next/link"
import { relativeTime, type ActivityItem } from "@/lib/dashboard/activityFeed"

interface ActivityFeedProps {
  items: ActivityItem[]
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Recent activity</h2>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No recent activity. Payments, lease changes, and maintenance updates will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const inner = (
              <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.dotColor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{item.title}</p>
                  {item.subtitle && (
                    <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
            )

            return (
              <li key={item.id}>
                {item.href ? <Link href={item.href}>{inner}</Link> : inner}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
