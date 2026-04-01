import Link from "next/link"
import type { AttentionItem } from "@/lib/dashboard/attentionItems"

interface AttentionQueueProps {
  items: AttentionItem[]
}

const badgeClasses = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
}

export function AttentionQueue({ items }: AttentionQueueProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                {/* Coloured dot */}
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.dotColor }}
                />

                {/* Title + subtitle */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{item.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
                </div>

                {/* Badge */}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClasses[item.badge.variant]}`}
                >
                  {item.badge.text}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
