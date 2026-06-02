"use client"

/**
 * components/ui/resource-list.tsx — shared chrome for populated portfolio / operations list pages
 *
 * Notes:  DRYs the populated-list branding so Properties / Landlords / Tenants / Suppliers / Leases /
 *         Applications / Maintenance / Inspections share ONE search bar, table frame and sort control
 *         instead of each re-implementing them. All token-driven, so light = white card on the page
 *         canvas (like the empty-state block) and dark flips automatically.
 *           • ListSearchBar — full-width search styled like the topbar GlobalSearch pill (square
 *             --r-button, bordered, bg-card), with a leading icon and a clear button.
 *           • ListCard     — the table frame (square, bordered, bg-card, clipped corners).
 *           • useListSort + SortHeader — the click-to-sort column header. Each page keeps its own
 *             columns/rows and supplies the comparator; this only owns the key/direction + affordance.
 */
import { useState, type ReactNode } from "react"
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

export function ListSearchBar({
  value, onChange, placeholder = "Search…",
}: Readonly<{ value: string; onChange: (v: string) => void; placeholder?: string }>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function ListCard({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={`overflow-hidden rounded-[var(--r-button)] border border-border bg-card ${className}`}>
      {children}
    </div>
  )
}

export type SortDir = "asc" | "desc"

/** Owns sort key + direction; clicking the active column flips direction, a new column resets to asc. */
export function useListSort<K extends string>(initialKey: K, initialDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)
  function onSort(col: K) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(col); setSortDir("asc") }
  }
  return { sortKey, sortDir, onSort }
}

export function SortHeader<K extends string>({
  col, label, sortKey, sortDir, onSort, align = "left",
}: Readonly<{
  col: K
  label: string
  sortKey: K
  sortDir: SortDir
  onSort: (col: K) => void
  align?: "left" | "right"
}>) {
  const active = col === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground ${align === "right" ? "ml-auto flex-row-reverse" : ""}`}
    >
      {label}
      {!active && <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground/50" />}
      {active && sortDir === "asc" && <ArrowUp className="ml-1 inline size-3.5 text-primary" />}
      {active && sortDir === "desc" && <ArrowDown className="ml-1 inline size-3.5 text-primary" />}
    </button>
  )
}
