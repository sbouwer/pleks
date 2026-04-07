import Link from "next/link"
import { formatZARAbbrev } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface PropertyCardProps {
  id: string
  name: string
  type: string
  addressLine1: string
  city: string
  isSectionalTitle: boolean
  totalUnits: number
  occupiedUnits: number
  rentRollCents: number
  attentionCount: number
}

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? (occupied / total) * 100 : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{occupied}/{total}</span>
    </div>
  )
}

export function PropertyCard({
  id, name, type, addressLine1, city, isSectionalTitle,
  totalUnits, occupiedUnits, rentRollCents, attentionCount,
}: PropertyCardProps) {
  return (
    <Link href={`/properties/${id}`}>
      <div className="group rounded-xl border border-border/60 bg-surface-elevated hover:border-brand/50 transition-colors cursor-pointer h-full px-4 py-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-snug group-hover:text-brand transition-colors line-clamp-1">
            {name}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] capitalize text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded">
              {type}
            </span>
            {isSectionalTitle && (
              <span className="text-[10px] font-medium text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded">
                BC
              </span>
            )}
          </div>
        </div>

        {/* Address */}
        <p className="text-xs text-muted-foreground line-clamp-1">
          {addressLine1}, {city}
        </p>

        {/* Bottom row */}
        <div className="flex items-center gap-3 mt-auto pt-1 flex-wrap text-xs text-muted-foreground">
          <span>{totalUnits} {totalUnits === 1 ? "unit" : "units"}</span>
          {totalUnits > 0 && <OccupancyBar occupied={occupiedUnits} total={totalUnits} />}
          {rentRollCents > 0 && (
            <span className="text-foreground font-medium">{formatZARAbbrev(rentRollCents)}/mo</span>
          )}
          {attentionCount > 0 && (
            <span className="ml-auto text-amber-500 font-medium">
              {attentionCount} attention
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
