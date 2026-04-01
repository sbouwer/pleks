import { Card } from "@/components/ui/card"

type BadgeVariant = "green" | "amber" | "red" | "blue" | "gray"

interface BadgeProps {
  text: string
  variant: BadgeVariant
}

interface ContactSidebarProps {
  avatar: { initials: string; bgColor: string; textColor: string }
  name: string
  subtitle: string
  badges?: BadgeProps[]
  quickActions?: React.ReactNode
  children?: React.ReactNode
}

const BADGE_STYLES: Record<BadgeVariant, string> = {
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  blue: "bg-info/10 text-info",
  gray: "bg-muted text-muted-foreground",
}

export function ContactSidebar({
  avatar,
  name,
  subtitle,
  badges = [],
  quickActions,
  children,
}: Readonly<ContactSidebarProps>) {
  return (
    <Card className="p-4">
      {/* Avatar + identity */}
      <div className="flex flex-col items-center text-center pb-4">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-semibold mb-3"
          style={{ backgroundColor: avatar.bgColor, color: avatar.textColor }}
        >
          {avatar.initials}
        </div>
        <h1 className="font-medium text-lg leading-tight">{name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mt-2">
            {badges.map((b) => (
              <span
                key={b.text}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_STYLES[b.variant]}`}
              >
                {b.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      {quickActions && (
        <div className="border-t border-b py-3 mb-1">
          {quickActions}
        </div>
      )}

      {/* Sidebar sections */}
      {children}
    </Card>
  )
}
