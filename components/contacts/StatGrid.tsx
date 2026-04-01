type StatVariant = "green" | "amber" | "red"

interface Stat {
  label: string
  value: string
  variant?: StatVariant
}

interface StatGridProps {
  stats: Stat[]
}

const VALUE_STYLES: Record<StatVariant, string> = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
}

export function StatGrid({ stats }: Readonly<StatGridProps>) {
  return (
    <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
          <p className={`text-sm font-medium ${stat.variant ? VALUE_STYLES[stat.variant] : ""}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}
