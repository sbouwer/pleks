"use client"

/**
 * components/layout/MobileSearchSheet.tsx — full-width mobile search (bottom sheet)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   online → GET /api/search?q= (same endpoint as desktop GlobalSearch).
 *         offline → local IndexedDB reference cache (contacts + properties) via searchReference.
 * Notes:  Tall bottom sheet; field autofocuses on open. Online results navigate; offline contact results
 *         expose tap-to-call / tap-to-email (which work with no signal) since detail pages are server-rendered.
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, User, Wrench, FileText, Loader2, WifiOff, Phone, Mail, ChevronRight } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { isOnline, onConnectivityChange } from "@/lib/offline/syncManager"
import { searchReference, type RefSearchResult } from "@/lib/offline/referenceCache"

interface MobileSearchSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type SearchResult = { type: string; id: string; label: string; subtitle: string; href: string }

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  property: { label: "Properties", icon: Building2 },
  tenant: { label: "Tenants", icon: User },
  maintenance: { label: "Maintenance", icon: Wrench },
  invoice: { label: "Invoices", icon: FileText },
}
const GROUP_ORDER = ["property", "tenant", "maintenance", "invoice"]

export function MobileSearchSheet({ open, onOpenChange }: MobileSearchSheetProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [offlineResults, setOfflineResults] = useState<RefSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Track connectivity while the sheet is mounted.
  useEffect(() => {
    setOnline(isOnline())
    return onConnectivityChange(setOnline)
  }, [])

  // Autofocus the field shortly after the sheet animates in.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setOfflineResults([])
      setLoading(false)
    }
  }, [open])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const runSearch = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      setOfflineResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      if (isOnline()) {
        const res = await fetch("/api/search?q=" + encodeURIComponent(value))
        const data = (await res.json()) as { results: SearchResult[] }
        setResults(data.results ?? [])
        setOfflineResults([])
      } else {
        // Offline — search the local reference cache.
        const hits = await searchReference(value).catch(() => [])
        setOfflineResults(hits)
        setResults([])
      }
      setLoading(false)
    }, 280)
  }, [])

  function navigate(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const groups: Record<string, SearchResult[]> = {}
  for (const r of results) {
    groups[r.type] ??= []
    groups[r.type].push(r)
  }

  const queryReady = query.trim().length >= 2
  const noOnlineHits = queryReady && !loading && online && results.length === 0
  const noOfflineHits = queryReady && !loading && !online && offlineResults.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl max-h-[88vh] h-[88vh] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Search</SheetTitle>
        </SheetHeader>

        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="relative">
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
              placeholder={online ? "Search properties, tenants, invoices…" : "Search saved contacts & properties…"}
              aria-label="Search"
              className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {!online && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-orange-500">
              <WifiOff className="size-3" />
              Offline — searching saved contacts &amp; properties.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!queryReady && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          )}
          {(noOnlineHits || noOfflineHits) && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
          )}

          {/* Online — grouped server results */}
          {online && GROUP_ORDER.map((type) => {
            const group = groups[type]
            if (!group?.length) return null
            const { label, icon: Icon } = TYPE_CONFIG[type] ?? { label: type, icon: Search }
            return (
              <div key={type}>
                <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2">
                  <Icon className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                </div>
                {group.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => navigate(result.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left border-b border-border/50 active:bg-muted transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{result.label}</p>
                      {result.subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{result.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )
          })}

          {/* Offline — cached contacts (tap-to-call/email) + properties */}
          {!online && offlineResults.map((r) =>
            r.type === "contact" ? (
              <div key={`c-${r.id}`} className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
                  {r.subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.subtitle}</p>}
                </div>
                {r.phone && (
                  <a href={`tel:${r.phone}`} aria-label={`Call ${r.label}`} className="h-9 w-9 grid place-items-center rounded-[var(--r-button)] border border-border text-brand active:scale-95 transition-transform">
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {r.email && (
                  <a href={`mailto:${r.email}`} aria-label={`Email ${r.label}`} className="h-9 w-9 grid place-items-center rounded-[var(--r-button)] border border-border text-muted-foreground active:scale-95 transition-transform">
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <button
                key={`p-${r.id}`}
                type="button"
                onClick={() => navigate(r.href)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left border-b border-border/50 active:bg-muted transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
                  {r.subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.subtitle}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ),
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
