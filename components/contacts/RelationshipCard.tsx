import Link from "next/link"

type BadgeVariant = "green" | "amber" | "red" | "blue" | "gray"

interface RelationshipCardProps {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  rightLabel?: string
  rightSublabel?: string
  rightBadge?: { text: string; variant: BadgeVariant }
  href: string
}

const BADGE_STYLES: Record<BadgeVariant, string> = {
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  blue: "bg-info/10 text-info",
  gray: "bg-muted text-muted-foreground",
}

export function RelationshipCard({
  icon,
  iconBg,
  title,
  subtitle,
  rightLabel,
  rightSublabel,
  rightBadge,
  href,
}: Readonly<RelationshipCardProps>) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface transition-colors -mx-1"
    >
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {rightLabel && (
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{rightLabel}</p>
          {rightSublabel && <p className="text-xs text-muted-foreground">{rightSublabel}</p>}
        </div>
      )}
      {rightBadge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${BADGE_STYLES[rightBadge.variant]}`}>
          {rightBadge.text}
        </span>
      )}
    </Link>
  )
}
