"use client"

import { useState } from "react"
import Link from "next/link"
import { formatZARAbbrev } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { ChevronUp, ChevronDown } from "lucide-react"
import { PropertyCards } from "./PropertyCards"
import type { PropertyCardData } from "./PropertyCards"
import type { Tier } from "@/lib/constants"

export interface PropertyListItem extends PropertyCardData {
  landlordName: string | null
}

type SortKey = "name" | "units" | "occupancy" | "rentRoll"
type SortDir = "asc" | "desc"

function CollectionBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">—</span>
  const cls = pct >= 95 ? "text-green-500" : pct >= 85 ? "text-amber-500" : "text-red-500"
  return <span className={cn("text-xs font-medium", cls)}>{pct}%</span>
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp className="size-3 text-muted-foreground/40" />
  return dir === "asc"
    ? <ChevronUp className="size-3 text-foreground" />
    : <ChevronDown className="size-3 text-foreground" />
}

interface ThProps {
  readonly label: string
  readonly sortable?: boolean
  readonly id?: SortKey
  readonly activeSortKey: SortKey
  readonly sortDir: SortDir
  readonly onSort: (key: SortKey) => void
}

function Th({ label, sortable, id, activeSortKey, sortDir, onSort }: ThProps) {
  if (!sortable || !id) return (
    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-3 py-2.5">
      {label}
    </th>
  )
  return (
    <th
      className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-3 py-2.5 cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(id)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon active={activeSortKey === id} dir={sortDir} />
      </span>
    </th>
  )
}

interface Props {
  readonly properties: PropertyListItem[]
  readonly view: "list" | "cards"
  readonly tier: Tier
  readonly totalUnitCount: number
}

export function PropertyList({ properties, view, tier, totalUnitCount }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  if (view === "cards") {
    return <PropertyCards properties={properties} tier={tier} totalUnitCount={totalUnitCount} />
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const sorted = [...properties].sort((a, b) => {
    const aUnits = a.units.filter(u => !u.is_archived)
    const bUnits = b.units.filter(u => !u.is_archived)
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
      av = aUnits.reduce((s, u) => s + (u.leases.find(l => l.status === "active")?.rent_amount_cents ?? 0), 0)
      bv = bUnits.reduce((s, u) => s + (u.leases.find(l => l.status === "active")?.rent_amount_cents ?? 0), 0)
    }
    return sortDir === "asc" ? av - bv : bv - av
  })

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 bg-muted/30">
          <tr>
            <Th label="Property" sortable id="name" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Landlord" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Units" sortable id="units" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Occupancy" sortable id="occupancy" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Rent roll" sortable id="rentRoll" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Collection" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {sorted.map((p) => {
            const activeUnits = p.units.filter(u => !u.is_archived)
            const occupied = activeUnits.filter(u => u.status === "occupied").length
            const total = activeUnits.length
            const occPct = total > 0 ? Math.round((occupied / total) * 100) : 0
            const occClass = occPct >= 90 ? "text-green-500" : occPct >= 70 ? "text-amber-500" : "text-red-500"
            const rentRoll = activeUnits.reduce((s, u) =>
              s + (u.leases.find(l => l.status === "active")?.rent_amount_cents ?? 0), 0)

            return (
              <tr
                key={p.id}
                className="hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => window.location.href = `/properties/${p.id}`}
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
                        className={cn("h-full rounded-full", occPct >= 90 ? "bg-green-500" : occPct >= 70 ? "bg-amber-500" : "bg-red-500")}
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
                  <CollectionBadge pct={null} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
