"use client"

/**
 * components/properties/PropertyList.tsx — sortable properties table / cards renderer for the list view
 *
 * Route:  /properties (Portfolio / Firm tier)
 * Auth:   rendered by PropertyListView under gatewaySSR
 * Data:   PropertyListItem[] prop (already search/status filtered server-side); `view` selects table vs cards
 * Notes:  Local client-side column sort via the shared useListSort/SortHeader (canonical arrows). Cards view
 *         renders the PropertyCard grid directly — the page header + KPI strip live in PropertyListView.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatZARAbbrev } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { isInForceLease } from "@/lib/leases/rentRoll"
import { PropertyCard } from "./PropertyCard"
import type { PropertyCardData } from "./PropertyCards"

export interface PropertyListItem extends PropertyCardData {
  landlordName: string | null
  /** rent collection rate % (paid vs due, this property) — null when nothing is due yet. */
  collectionPct?: number | null
}

type SortKey = "name" | "units" | "occupancy" | "rentRoll"

function CollectionBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">—</span>
  let cls: string
  let bar: string
  if (pct >= 95) { cls = "text-green-500"; bar = "bg-green-500" }
  else if (pct >= 85) { cls = "text-amber-500"; bar = "bg-amber-500" }
  else { cls = "text-red-500"; bar = "bg-red-500" }
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={cn("text-xs font-medium", cls)}>{pct}%</span>
    </div>
  )
}

const PLAIN_TH = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70"

interface Props {
  readonly properties: PropertyListItem[]
  readonly view: "list" | "cards"
}

export function PropertyList({ properties, view }: Props) {
  const router = useRouter()
  const { sortKey, sortDir, onSort } = useListSort<SortKey>("name")

  // Search + status filtering are handled upstream (PropertyFilters + the page); this just renders.
  const filtered = properties

  if (view === "cards") {
    if (filtered.length === 0) {
      return <p className="py-8 text-center text-sm text-muted-foreground">No properties match your search.</p>
    }
    return (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const activeUnits = p.units.filter(u => !u.deleted_at)
          const occupied = activeUnits.filter(u => u.status === "occupied").length
          const rentRoll = activeUnits.reduce((sum, u) => sum + (u.leases.find(l => isInForceLease(l.status))?.rent_amount_cents ?? 0), 0)
          return (
            <PropertyCard
              key={p.id}
              id={p.id}
              name={p.name}
              type={p.type}
              addressLine1={p.address_line1}
              city={p.city}
              isSectionalTitle={p.is_sectional_title ?? false}
              totalUnits={activeUnits.length}
              occupiedUnits={occupied}
              rentRollCents={rentRoll}
              attentionCount={0}
            />
          )
        })}
      </div>
    )
  }

  const sorted = [...filtered].sort((a, b) => {
    const aUnits = a.units.filter(u => !u.deleted_at)
    const bUnits = b.units.filter(u => !u.deleted_at)
    let av = 0, bv = 0
    if (sortKey === "name") return sortDir === "asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
    if (sortKey === "units") { av = aUnits.length; bv = bUnits.length }
    if (sortKey === "occupancy") {
      av = aUnits.length > 0 ? aUnits.filter(u => u.status === "occupied").length / aUnits.length : 0
      bv = bUnits.length > 0 ? bUnits.filter(u => u.status === "occupied").length / bUnits.length : 0
    }
    if (sortKey === "rentRoll") {
      av = aUnits.reduce((s, u) => s + (u.leases.find(l => isInForceLease(l.status))?.rent_amount_cents ?? 0), 0)
      bv = bUnits.reduce((s, u) => s + (u.leases.find(l => isInForceLease(l.status))?.rent_amount_cents ?? 0), 0)
    }
    return sortDir === "asc" ? av - bv : bv - av
  })

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No properties match your search.</p>
  }

  return (
    <ListCard fill>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border/60 bg-card">
          <tr>
            <th className="px-3 py-2.5 text-left"><SortHeader col="name" label="Property" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
            <th className={PLAIN_TH}>Landlord</th>
            <th className="px-3 py-2.5 text-left"><SortHeader col="units" label="Units" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
            <th className="px-3 py-2.5 text-left"><SortHeader col="occupancy" label="Occupancy" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
            <th className="px-3 py-2.5 text-left"><SortHeader col="rentRoll" label="Rent roll" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
            <th className={PLAIN_TH}>Collection</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {sorted.map((p) => {
            const activeUnits = p.units.filter(u => !u.deleted_at)
            const occupied = activeUnits.filter(u => u.status === "occupied").length
            const total = activeUnits.length
            const occPct = total > 0 ? Math.round((occupied / total) * 100) : 0
            let occClass: string
            if (occPct >= 90) { occClass = "text-green-500" }
            else if (occPct >= 70) { occClass = "text-amber-500" }
            else { occClass = "text-red-500" }
            let occBarColor: string
            if (occPct >= 90) { occBarColor = "bg-green-500" }
            else if (occPct >= 70) { occBarColor = "bg-amber-500" }
            else { occBarColor = "bg-red-500" }
            const rentRoll = activeUnits.reduce((s, u) =>
              s + (u.leases.find(l => isInForceLease(l.status))?.rent_amount_cents ?? 0), 0)

            return (
              <tr
                key={p.id}
                className="hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/properties/${p.id}`)}
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/properties/${p.id}`}
                      className="font-medium hover:text-brand transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {p.name}
                    </Link>
                    {p.is_sectional_title && (
                      <span className="text-[10px] font-medium text-muted-foreground border border-border/60 px-1 py-0.5 rounded">
                        BC
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.address_line1}, {p.city}</p>
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs">{p.landlordName ?? "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{total}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", occBarColor)}
                        style={{ width: `${occPct}%` }}
                      />
                    </div>
                    <span className={cn("text-xs font-medium", occClass)}>{occPct}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-sm font-medium">
                  {rentRoll > 0 ? formatZARAbbrev(rentRoll) : "—"}
                </td>
                <td className="px-3 py-3">
                  <CollectionBadge pct={p.collectionPct ?? null} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </ListCard>
  )
}
