"use client"

/**
 * components/layout/GlobalSearch.tsx — reusable inline search combobox
 *
 * Route:  the dashboard Topbar (header search) + the settings Overview (settings search)
 * Auth:   dashboard layout (gateway)
 * Data:   pluggable — defaults to GET /api/search?q= (debounced); a caller can pass its own `search`
 *         (e.g. a client-side settings index). Results grouped by type via `typeConfig`/`groupOrder`.
 * Notes:  Inline — the field IS the input; typing drops a results panel right below it (no modal).
 *         ⌘K focuses it (when `enableShortcut`); ↑↓ navigate, ↵ open, Esc/outside-click close. Square +
 *         bg-card + bg-popover, token-driven so it flips for dark. Defaults reproduce the header search
 *         exactly, so <GlobalSearch /> with no props is unchanged.
 */
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, User, Wrench, FileText, Loader2 } from "lucide-react"

export type SearchResult = {
  type: string
  id: string
  label: string
  subtitle: string
  href: string
}

export interface SearchGroupConfig {
  /** the (already-plural) group header, e.g. "Properties", "Settings" */
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const DEFAULT_TYPE_CONFIG: Record<string, SearchGroupConfig> = {
  property: { label: "Properties", icon: Building2 },
  tenant: { label: "Tenants", icon: User },
  maintenance: { label: "Maintenance", icon: Wrench },
  invoice: { label: "Invoices", icon: FileText },
}
const DEFAULT_GROUP_ORDER = ["property", "tenant", "maintenance", "invoice"]

async function defaultSearch(value: string): Promise<SearchResult[]> {
  const res = await fetch("/api/search?q=" + encodeURIComponent(value))
  const data = (await res.json()) as { results: SearchResult[] }
  return data.results ?? []
}

function groupResults(results: SearchResult[]): Record<string, SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = []
    groups[r.type].push(r)
  }
  return groups
}

export function GlobalSearch({
  placeholder = "Search properties, tenants, invoices…",
  containerClassName = "w-[34rem] xl:w-[44rem]",
  minChars = 2,
  enableShortcut = true,
  search = defaultSearch,
  typeConfig = DEFAULT_TYPE_CONFIG,
  groupOrder = DEFAULT_GROUP_ORDER,
}: Readonly<{
  placeholder?: string
  containerClassName?: string
  minChars?: number
  enableShortcut?: boolean
  search?: (value: string) => Promise<SearchResult[]>
  typeConfig?: Record<string, SearchGroupConfig>
  groupOrder?: string[]
}>) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // ⌘K / Ctrl+K focuses the field (no modal). Only the global header instance binds it.
  useEffect(() => {
    if (!enableShortcut) return
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [enableShortcut])

  // Close the panel on any outside click.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const runSearch = useCallback((value: string) => {
    setQuery(value)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < minChars) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const found = await search(value)
      setResults(found)
      setLoading(false)
      setActiveIndex(0)
    }, 280)
  }, [search, minChars])

  const groups = groupResults(results)
  const flatResults = groupOrder.flatMap((t) => groups[t] ?? [])

  function navigate(href: string) {
    router.push(href)
    setOpen(false)
    setQuery("")
    setResults([])
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && flatResults[activeIndex]) { navigate(flatResults[activeIndex].href) }
  }

  const showPanel = open && query.trim().length >= minChars

  return (
    <div ref={containerRef} className={`relative ${containerClassName}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        name="global-search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        onFocus={() => { if (query.trim().length >= minChars) setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search"
        className="h-10 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        enableShortcut && !query && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        )
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[var(--r-button)] border border-border bg-popover shadow-lg">
          <div className="max-h-[60vh] overflow-y-auto">
          {!loading && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {groupOrder.map((type) => {
            const group = groups[type]
            if (!group?.length) return null
            const { label, icon: Icon } = typeConfig[type] ?? { label: type, icon: Search }
            return (
              <div key={type}>
                <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2">
                  <Icon className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                </div>
                {group.map((result) => {
                  const flatIdx = flatResults.indexOf(result)
                  const isActive = flatIdx === activeIndex
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); navigate(result.href) }}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/40"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{result.label}</p>
                        {result.subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{result.subtitle}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {results.length > 0 && (
            <div className="flex items-center gap-4 border-t border-border bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>Esc close</span>
            </div>
          )}
          </div>
          {/* amber doorsill — matches the profile / quick-add dropdowns */}
          <div aria-hidden className="h-1 w-full bg-primary" />
        </div>
      )}
    </div>
  )
}
