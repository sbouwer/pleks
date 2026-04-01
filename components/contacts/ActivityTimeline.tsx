interface TimelineItem {
  dotColor: string
  title: string
  time: string
}

interface ActivityTimelineProps {
  items: TimelineItem[]
  maxItems?: number
}

export function ActivityTimeline({ items, maxItems = 5 }: Readonly<ActivityTimelineProps>) {
  const visible = items.slice(0, maxItems)
  const hasMore = items.length > maxItems

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>
  }

  return (
    <div className="space-y-2">
      {visible.map((item, i) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          <div
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ backgroundColor: item.dotColor }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug">{item.title}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{item.time}</span>
        </div>
      ))}
      {hasMore && (
        <p className="text-xs text-muted-foreground pt-1">+{items.length - maxItems} more</p>
      )}
    </div>
  )
}
