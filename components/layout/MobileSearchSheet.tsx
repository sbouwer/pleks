"use client"

/**
 * components/layout/MobileSearchSheet.tsx — full-width mobile search (bottom sheet)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   GET /api/search?q= (debounced) — same endpoint as the desktop GlobalSearch
 * Notes:  Tall bottom sheet; the field autofocuses on open. Tapping a result navigates and closes.
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, User, Wrench, FileText, Loader2 } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

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
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

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
      setLoading(false)
    }
  }, [open])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const runSearch = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch("/api/search?q=" + encodeURIComponent(value))
      const data = (await res.json()) as { results: SearchResult[] }
      setResults(data.results ?? [])
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
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search properties, tenants, invoices…"
              aria-label="Search"
              className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          )}
          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
          )}
          {GROUP_ORDER.map((type) => {
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
