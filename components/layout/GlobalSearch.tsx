"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, User, Wrench, FileText, X, Loader2 } from "lucide-react"

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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const openSearch = useCallback(() => {
    setOpen(true)
    setQuery("")
    setResults([])
    setActiveIndex(0)
  }, [])

  const closeSearch = useCallback(() => {
    setOpen(false)
    setQuery("")
    setResults([])
  }, [])

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        if (open) {
          closeSearch()
        } else {
          openSearch()
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, openSearch, closeSearch])

  // Open/close the native dialog
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
      setTimeout(() => inputRef.current?.focus(), 50)
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < 2) {
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
  }

  function navigate(href: string) {
    router.push(href)
    closeSearch()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeSearch()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && results[activeIndex]) {
      navigate(results[activeIndex].href)
    }
  }

  const groups = groupResults(results)
  const flatResults = GROUP_ORDER.flatMap((t) => groups[t] ?? [])

  return (
    <>
      <button
        onClick={openSearch}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
        title="Search (⌘K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden md:inline ml-1 text-[10px] border border-border rounded px-1 py-0.5 bg-background font-mono">⌘K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search"
        onClose={closeSearch}
        className="fixed inset-0 z-50 w-full max-w-lg mx-auto mt-[10vh] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-popover">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search properties, tenants, invoices…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button
            onClick={closeSearch}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto bg-popover">
          {query.length < 2 && (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              Type at least 2 characters to search
            </p>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
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
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/50">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {groupLabel}
                  </span>
                </div>
                {group.map((result) => {
                  const flatIdx = flatResults.indexOf(result)
                  const isActive = flatIdx === activeIndex
                  return (
                    <button
                      key={result.id}
                      onClick={() => navigate(result.href)}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/30"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{result.label}</p>
                        {result.subtitle && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{result.subtitle}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 flex items-center gap-4 text-[11px] text-muted-foreground bg-muted/10">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>Esc close</span>
          </div>
        )}
      </dialog>
    </>
  )
}
