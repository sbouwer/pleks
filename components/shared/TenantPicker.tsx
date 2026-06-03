"use client"

/**
 * components/shared/TenantPicker.tsx — searchable tenant dropdown with inline "add new tenant"
 *
 * Auth:   dashboard layout (gateway); the add path goes through addTenantParty (agent write gate)
 * Data:   tenant list via fetchTenants (React Query, org-scoped)
 * Notes:  Dual-mode "Add new tenant" (ADDENDUM_LEASE_CREATION_MODAL Phase 2, D-8):
 *           • Hosted in a wizard-modal (lease builder) → an AddTenantProvider supplies the bridge, so the
 *             picker calls openAddTenant() and the host swaps the SAME modal to the in-modal sub-flow
 *             ("Back to lease"); it returns with the new tenant id (lastCreatedId) + a bumped refreshNonce.
 *           • Plain page (VacantSection, inspections, co-tenant manager) → no provider, so it opens the
 *             shared AddPartyModal IN PLACE (no navigation), exactly as before.
 *         Either way it invalidates the list and auto-selects the new tenant once it lands. Replaced the old
 *         /tenants/new?returnTo navigation (ADDENDUM_25A lease-flow). Dropdown panel + "Add new tenant" link
 *         squared onto the new primary+square design language (rounded-[var(--r-button)], text-primary).
 */
import { useState, useRef, useEffect, cloneElement, isValidElement } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchTenants } from "@/lib/queries/portfolio"
import { Search, UserRound, Plus } from "lucide-react"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { addTenantParty } from "@/lib/actions/parties"
import { contactDisplayName } from "@/lib/contacts/displayName"
import { useAddTenantSubflow } from "@/app/(dashboard)/leases/new/addTenantContext"

export interface PickedTenant {
  id: string
  name: string
  contact_id: string | null
  phone: string | null
  entity_type: string | null
  juristic_type: string | null
  turnover_under_2m: boolean | null
  asset_value_under_2m: boolean | null
  size_bands_captured_at: string | null
}

interface TenantRow {
  id: string
  contact_id: string | null
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
  return contactDisplayName(t)
}

interface TenantPickerProps {
  orgId: string
  onSelect: (tenant: PickedTenant) => void
  trigger: React.ReactNode
  align?: "left" | "right"
  excludeIds?: string[]
}

export function TenantPicker({ orgId, onSelect, trigger, align = "left", excludeIds }: Readonly<TenantPickerProps>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set when THIS picker launched the hosted sub-flow, so only it (not the sibling co-tenant pickers
  // sharing the same provider) consumes the created tenant when the host bumps the nonce.
  const openedSubflowRef = useRef(false)
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Present only when this picker is hosted inside the lease wizard-modal (D-8). When present, "Add new
  // tenant" swaps the host modal to the in-modal sub-flow instead of opening the standalone AddPartyModal.
  const subflow = useAddTenantSubflow()

  const { data: tenants = [] } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    queryFn: () => fetchTenants(supabase, orgId),
    staleTime: STALE_TIME.tenants,
    enabled: !!orgId,
  })

  // Hosted sub-flow finished a create → re-fetch the list and queue the new tenant for auto-select,
  // but only in the picker that opened it. (The standalone path queues pendingSelectId from onSubmit.)
  const hostNonce = subflow?.refreshNonce ?? 0
  const hostCreatedId = subflow?.lastCreatedId ?? null
  useEffect(() => {
    if (!hostCreatedId || !openedSubflowRef.current) return
    openedSubflowRef.current = false
    void queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId) })
    setPendingSelectId(hostCreatedId)
  }, [hostNonce, hostCreatedId, orgId, queryClient])

  // After an inline add, the new tenant lands in the refetched list — auto-select it for the host flow.
  useEffect(() => {
    if (!pendingSelectId) return
    const t = (tenants as TenantRow[]).find((x) => x.id === pendingSelectId)
    if (!t) return
    onSelect({
      id: t.id,
      name: displayName(t),
      contact_id: t.contact_id ?? null,
      phone: t.phone ?? null,
      entity_type: t.entity_type,
      juristic_type: t.juristic_type ?? null,
      turnover_under_2m: t.turnover_under_2m ?? null,
      asset_value_under_2m: t.asset_value_under_2m ?? null,
      size_bands_captured_at: t.size_bands_captured_at ?? null,
    })
    setPendingSelectId(null)
  }, [tenants, pendingSelectId, onSelect])

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
      contact_id: t.contact_id ?? null,
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

  return (
    <div ref={containerRef} className="relative">
      {triggerWithHandler}

      <AddPartyModal
        role="tenant"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (input) => {
          const result = await addTenantParty(input)
          if (result.ok && result.id) setPendingSelectId(result.id)
          return result
        }}
        onCreated={() => queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId) })}
      />

      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1 z-50 w-72 rounded-[var(--r-button)] border border-border bg-card shadow-lg`}>
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
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted/50 rounded-[var(--r-button)] transition-colors"
              onClick={() => {
                close()
                if (subflow) { openedSubflowRef.current = true; subflow.openAddTenant() }
                else setAddOpen(true)
              }}
            >
              <Plus className="size-4" />
              Add new tenant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
