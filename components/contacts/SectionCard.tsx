import { Card, CardContent, CardHeader } from "@/components/ui/card"
import Link from "next/link"

interface SectionCardProps {
  title: string
  count?: number
  action?: { label: string; href: string }
  children: React.ReactNode
}

export function SectionCard({ title, count, action, children }: Readonly<SectionCardProps>) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-sm">{title}</h2>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{count}</span>
          )}
        </div>
        {action && (
          <Link href={action.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}
