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
import { useState, useRef, useEffect, type ReactNode } from "react"
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, List, LayoutGrid, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

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

export function ListCard({ children, className = "", fill = false }: Readonly<{ children: ReactNode; className?: string; fill?: boolean }>) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-button)] border border-border bg-card",
        // fill: flex-grow to fill the remaining height of a flex-col page (offset-agnostic — no magic
        // calc) and scroll INSIDE the card; pair with a `sticky top-0` thead. The page chain must be
        // `flex h-full flex-col` with the chrome shrink-0 so this has a bounded box to fill.
        fill ? "min-h-0 flex-1 overflow-auto" : "overflow-hidden",
        className,
      )}
    >
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
      className={`flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 transition-colors hover:text-foreground ${align === "right" ? "ml-auto flex-row-reverse" : ""}`}
    >
      {label}
      {!active && <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground/50" />}
      {active && sortDir === "asc" && <ArrowUp className="ml-1 inline size-3.5 text-primary" />}
      {active && sortDir === "desc" && <ArrowDown className="ml-1 inline size-3.5 text-primary" />}
    </button>
  )
}

/* ── Joint list toolbar ───────────────────────────────────────────────────────
   The "iconic square compartments" row atop a list: [filters: status · …] ·
   [Search] · [List/Grid]. Each control is a square (--r-button) bordered bg-card
   box at a shared h-11; gaps separate them. Search grows to fill. View toggle +
   filter slot are optional, so a list with no cards mode / no filters still uses
   the same bar. */
export type ListView = "list" | "cards"

const COMPARTMENT = "h-11 rounded-[var(--r-button)] border border-border bg-card"

function ViewToggle({ view, onView }: Readonly<{ view: ListView; onView: (v: ListView) => void }>) {
  const seg = (v: ListView, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => onView(v)}
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-full items-center gap-1.5 rounded-[calc(var(--r-button)-2px)] px-3 text-xs font-medium transition-colors",
        view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
  return (
    <div className={cn(COMPARTMENT, "inline-flex shrink-0 items-center p-1")}>
      {seg("list", <List className="size-3.5" />, "List")}
      {seg("cards", <LayoutGrid className="size-3.5" />, "Cards")}
    </div>
  )
}

/** Square-compartment filter dropdown. A custom popover (NOT a native <select>) so it: opens BELOW the
 *  trigger, uses the square pill style + a themed dark popup, and supports multi-select with checkboxes.
 *  The trigger reads "Label: summary" — e.g. "Status: Active", "Categories: All", "Categories: Plumbing +2".
 *  Single-select passes a 0/1-length `selected` array; multi-select passes `multiple` + the full array. */
export function ToolbarFilter({
  label, options, selected, onChange, multiple = false,
}: Readonly<{
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  selected: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
}>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc) }
  }, [open])

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  let summary = "All"
  if (selected.length === 1) summary = labelFor(selected[0] ?? "")
  else if (selected.length > 1) summary = `${labelFor(selected[0] ?? "")} +${selected.length - 1}`

  function pick(v: string) {
    if (multiple) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
    } else {
      onChange([v])
      setOpen(false)
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(COMPARTMENT, "flex items-center gap-1.5 px-3.5 text-sm text-foreground transition-colors hover:bg-muted/30", open && "border-primary/60 ring-2 ring-primary/15")}
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{summary}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[12rem] overflow-hidden rounded-[var(--r-button)] border border-border bg-popover p-1 shadow-lg">
          {options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center gap-2.5 rounded-[calc(var(--r-button)-1px)] px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
              >
                {multiple ? (
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded-[2px] border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                ) : (
                  <span className="grid size-4 shrink-0 place-items-center">{checked && <Check className="size-3.5 text-primary" strokeWidth={3} />}</span>
                )}
                <span className={cn(checked && "font-medium")}>{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ListToolbar({
  search, onSearch, placeholder = "Search…", view, onView, filters, rightFilters,
}: Readonly<{
  search: string
  onSearch: (v: string) => void
  placeholder?: string
  /** omit view/onView to drop the list/grid compartment (lists with no cards mode) */
  view?: ListView
  onView?: (v: ListView) => void
  /** one or more ToolbarSelect compartments (or any control) shown between the toggle and search */
  filters?: ReactNode
  /** control(s) shown on the right, just before the list/grid toggle (e.g. a My work / All view filter) */
  rightFilters?: ReactNode
}>) {
  return (
    <div className="flex items-center gap-2">
      {filters}
      <div className="min-w-0 flex-1">
        <ListSearchBar value={search} onChange={onSearch} placeholder={placeholder} />
      </div>
      {rightFilters}
      {view && onView && <ViewToggle view={view} onView={onView} />}
    </div>
  )
}
