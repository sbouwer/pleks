"use client"

import { useState, useRef, useEffect, cloneElement, isValidElement } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchTenants } from "@/lib/queries/portfolio"
import { Search, UserRound, Plus } from "lucide-react"
import Link from "next/link"

export interface PickedTenant {
  id: string
  name: string
  phone: string | null
  entity_type: string | null
  juristic_type: string | null
  turnover_under_2m: boolean | null
  asset_value_under_2m: boolean | null
  size_bands_captured_at: string | null
}

interface TenantRow {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  entity_type: string | null
  email: string | null
  phone: string | null
  juristic_type: string | null
  turnover_under_2m: boolean | null
  asset_value_under_2m: boolean | null
  size_bands_captured_at: string | null
}

function displayName(t: TenantRow): string {
  if (t.entity_type === "juristic" && t.company_name) return t.company_name
  return `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Unnamed"
}

interface TenantPickerProps {
  orgId: string
  onSelect: (tenant: PickedTenant) => void
  trigger: React.ReactNode
  returnTo?: string
  align?: "left" | "right"
  excludeIds?: string[]
}

export function TenantPicker({ orgId, onSelect, trigger, returnTo, align = "left", excludeIds }: Readonly<TenantPickerProps>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const { data: tenants = [] } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    queryFn: () => fetchTenants(supabase, orgId),
    staleTime: STALE_TIME.tenants,
    enabled: !!orgId,
  })

  function close() {
    setOpen(false)
    setSearch("")
  }

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open]) // close is stable — defined above this effect

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function handleSelect(t: TenantRow) {
    onSelect({
      id: t.id,
      name: displayName(t),
      phone: t.phone ?? null,
      entity_type: t.entity_type,
      juristic_type: t.juristic_type ?? null,
      turnover_under_2m: t.turnover_under_2m ?? null,
      asset_value_under_2m: t.asset_value_under_2m ?? null,
      size_bands_captured_at: t.size_bands_captured_at ?? null,
    })
    close()
  }

  const filtered = (tenants as TenantRow[]).filter((t) => {
    if (excludeIds?.includes(t.id)) return false
    if (!search) return true
    const name = displayName(t).toLowerCase()
    const phone = t.phone?.toLowerCase() ?? ""
    const email = t.email?.toLowerCase() ?? ""
    const q = search.toLowerCase()
    return name.includes(q) || phone.includes(q) || email.includes(q)
  })

  // Inject toggle handler directly onto the trigger element to avoid a
  // non-interactive div wrapper (accessibility requirement)
  const triggerWithHandler = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
        onClick: () => setOpen((v) => !v),
      })
    : trigger

  const addTenantHref = returnTo
    ? `/tenants/new?returnTo=${encodeURIComponent(returnTo)}`
    : "/tenants/new"

  return (
    <div ref={containerRef} className="relative">
      {triggerWithHandler}

      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1 z-50 w-72 rounded-xl border border-border/60 bg-surface-elevated shadow-lg`}>
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            <Search className="size-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No tenants found</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelect(t)}
                >
                  <div className="size-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <UserRound className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{displayName(t)}</p>
                    {t.phone && (
                      <p className="text-xs text-muted-foreground truncate">{t.phone}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 p-1">
            <Link
              href={addTenantHref}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand hover:bg-muted/50 rounded-lg transition-colors"
              onClick={close}
            >
              <Plus className="size-4" />
              Add new tenant
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
