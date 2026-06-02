"use client"

/**
 * components/layout/GlobalSearch.tsx — header global search (inline combobox)
 *
 * Route:  rendered in the dashboard Topbar (desktop)
 * Auth:   dashboard layout (gateway)
 * Data:   GET /api/search?q= (debounced); results grouped by type
 * Notes:  Inline — the header field IS the input; typing drops a results panel right below it (no
 *         modal). ⌘K focuses it; ↑↓ navigate, ↵ open, Esc/outside-click close. Square + bg-card +
 *         bg-popover panel, token-driven so it flips for dark.
 */
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, User, Wrench, FileText, Loader2 } from "lucide-react"

type SearchResult = {
  type: string
  id: string
  label: string
  subtitle: string
  href: string
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  property: { label: "Property", icon: Building2 },
  tenant: { label: "Tenant", icon: User },
  maintenance: { label: "Maintenance", icon: Wrench },
  invoice: { label: "Invoice", icon: FileText },
}

const GROUP_ORDER = ["property", "tenant", "maintenance", "invoice"]

function groupResults(results: SearchResult[]): Record<string, SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = []
    groups[r.type].push(r)
  }
  return groups
}

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // ⌘K / Ctrl+K focuses the field (no modal to open anymore).
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

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
    if (value.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch("/api/search?q=" + encodeURIComponent(value))
      const data = await res.json() as { results: SearchResult[] }
      setResults(data.results ?? [])
      setLoading(false)
      setActiveIndex(0)
    }, 280)
  }, [])

  const groups = groupResults(results)
  const flatResults = GROUP_ORDER.flatMap((t) => groups[t] ?? [])

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

  const showPanel = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="relative w-[34rem] xl:w-[44rem]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder="Search properties, tenants, invoices…"
        aria-label="Search"
        className="h-10 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        !query && (
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

          {GROUP_ORDER.map((type) => {
            const group = groups[type]
            if (!group?.length) return null
            const { label, icon: Icon } = TYPE_CONFIG[type] ?? { label: type, icon: Search }
            const groupLabel = label === "Property" ? "Properties" : label + "s"
            return (
              <div key={type}>
                <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2">
                  <Icon className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{groupLabel}</span>
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
