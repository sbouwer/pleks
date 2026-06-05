"use client"

/**
 * app/(dashboard)/landlords/LandlordsClient.tsx — searchable, sortable landlord list with archive/restore
 *
 * Route:  /landlords
 * Auth:   dashboard layout (gateway); archive/restore admin-only
 * Data:   landlords prop (active) from server page; archived loaded lazily via fetchArchivedLandlords
 * Notes:  "Delete" is ARCHIVE (soft-delete) — reversible via the Archived view's Restore; an in-force
 *         lease blocks it (409 → toast). Fill-scroll — root is flex-1 min-h-0 flex-col; desktop table/cards-grid fill the viewport and
 *         scroll inside the card (sticky thead), page itself doesn't scroll. Mobile (lg:hidden) keeps its
 *         own scrolling card list regardless of the desktop List/Cards toggle.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Archive, RotateCcw } from "lucide-react"
import { ActionButton, EditButton, DeleteButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { toast } from "sonner"
import { useOrg } from "@/hooks/useOrg"
import { usePermissions } from "@/hooks/usePermissions"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { fetchLandlordParty, updateLandlordParty } from "@/lib/actions/parties"
import { fetchArchivedLandlords, type ArchivedParty } from "@/lib/actions/partyArchive"

interface Landlord {
  id: string
  contact_id: string
  entity_type: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  phone: string | null
  properties: string[]
}

interface Props {
  readonly landlords: Landlord[]
}

type SortKey = "name" | "email" | "phone" | "type"

/** Card-view tile (the "Cards" toggle) — mirrors the list row's data + hover edit/delete actions. */
function LandlordCard({
  l, isAdmin, isDeleting, onOpen, onEdit, onDelete,
}: Readonly<{
  l: Landlord
  isAdmin: boolean
  isDeleting: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}>) {
  const displayName = l.company_name || `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "Unnamed"
  const props = l.properties.slice(0, 3)
  const extra = l.properties.length - 3
  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="text-[11px] text-muted-foreground">{l.entity_type === "organisation" ? "Company" : "Individual"}</p>
        </div>
      </div>

      {props.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {props.map((p) => (
            <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
          ))}
          {extra > 0 && <Badge variant="secondary" className="text-[10px] text-muted-foreground">+{extra}</Badge>}
        </div>
      )}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        {l.phone && <p className="truncate">{l.phone}</p>}
        {l.email && <p className="truncate">{l.email}</p>}
        {!l.phone && !l.email && <p className="text-muted-foreground/40">No contact details</p>}
      </div>

      <div
        className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <EditButton label="Edit landlord" onClick={onEdit} />
        {isAdmin && (
          <DeleteButton
            icon={Archive}
            label="Archive landlord"
            title={`Archive ${displayName}?`}
            itemName="this landlord"
            description="They leave your active list, but all history is kept and you can restore them anytime. An in-force lease blocks archiving."
            confirmLabel="Archive"
            loading={isDeleting}
            onConfirm={onDelete}
          />
        )}
      </div>
    </div>
  )
}

export function LandlordsClient({ landlords: initial }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const { isAdmin } = usePermissions()
  const [search, setSearch] = useState("")
  const [types, setTypes] = useState<string[]>([])
  const { sortKey, sortDir, onSort } = useListSort<SortKey>("name")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "cards">("list")
  const [status, setStatus] = useState<"active" | "archived">("active")
  const [archived, setArchived] = useState<ArchivedParty[]>([])
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function handleStatusChange(next: "active" | "archived") {
    setStatus(next)
    if (next === "archived" && !archivedLoaded && !loadingArchived) {
      setLoadingArchived(true)
      setArchived(await fetchArchivedLandlords())
      setArchivedLoaded(true)
      setLoadingArchived(false)
    }
  }

  async function handleRestore(a: ArchivedParty) {
    setRestoringId(a.id)
    const res = await fetch("/api/landlords", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landlordId: a.id, restore: true }),
    })
    setRestoringId(null)
    if (res.ok) {
      toast.success("Landlord restored")
      setArchived((prev) => prev.filter((x) => x.id !== a.id))
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId) })
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
      }
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || "Could not restore")
    }
  }

  const filtered = initial
    .filter((l) => {
      if (types.length > 0 && !types.includes(l.entity_type)) return false
      if (!search) return true
      const name = (l.company_name || `${l.first_name ?? ""} ${l.last_name ?? ""}`).toLowerCase()
      return name.includes(search.toLowerCase()) ||
        l.email?.toLowerCase().includes(search.toLowerCase()) ||
        l.phone?.includes(search)
    })
    .sort((a, b) => {
      const nameA = (a.company_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase()
      const nameB = (b.company_name || `${b.first_name ?? ""} ${b.last_name ?? ""}`).toLowerCase()
      let valA = "", valB = ""
      if (sortKey === "name") { valA = nameA; valB = nameB }
      else if (sortKey === "email") { valA = a.email?.toLowerCase() ?? ""; valB = b.email?.toLowerCase() ?? "" }
      else if (sortKey === "phone") { valA = a.phone ?? ""; valB = b.phone ?? "" }
      else if (sortKey === "type") { valA = a.entity_type; valB = b.entity_type }
      const cmp = valA.localeCompare(valB)
      return sortDir === "asc" ? cmp : -cmp
    })

  // Returns { blocked } so the DeleteButton's dialog morphs into an acknowledge view (no toast for the
  // in-force block). Other failures still toast. Success closes the dialog + toasts.
  async function handleDelete(l: Landlord): Promise<void | { blocked: string }> {
    setDeletingId(l.id)
    const res = await fetch("/api/landlords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landlordId: l.id }),
    })
    setDeletingId(null)
    if (res.ok) {
      toast.success("Landlord archived")
      setArchivedLoaded(false)   // archived list is now stale
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId) })
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
      }
      router.refresh()
      return
    }
    const d = await res.json().catch(() => ({}))
    if (d.error === "in_force_lease") {
      return { blocked: "This landlord has an in-force lease (active, on notice, or month-to-month). End the lease before archiving — archiving only hides them from active lists, it never ends a live tenancy." }
    }
    toast.error(d.error || "Failed to archive")
  }

  const plural = (n: number) => (n === 1 ? "" : "s")
  const countLabel = status === "archived"
    ? `${archived.length} archived landlord${plural(archived.length)}`
    : `${filtered.length} of ${initial.length} landlord${plural(initial.length)}`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name, email or phone…"
        view={view}
        onView={setView}
        filters={
          <>
            <ToolbarFilter
              label="Status"
              selected={[status]}
              onChange={(next) => handleStatusChange(next[0] === "archived" ? "archived" : "active")}
              options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
            />
            {status === "active" && (
              <ToolbarFilter
                label="Type"
                multiple
                selected={types}
                onChange={setTypes}
                options={[{ value: "individual", label: "Individual" }, { value: "organisation", label: "Company" }]}
              />
            )}
          </>
        }
      />

      <p className="text-xs text-muted-foreground">{countLabel}</p>

      {status === "archived" && (
        <>
          {loadingArchived && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
          {!loadingArchived && archived.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No archived landlords.</p>
          )}
          {!loadingArchived && archived.length > 0 && (
            <ListCard fill>
              <div className="divide-y divide-border/50">
                {archived.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">Archived</p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRestore(a)}
                        disabled={restoringId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" /> {restoringId === a.id ? "Restoring…" : "Restore"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </ListCard>
          )}
        </>
      )}

      {status === "active" && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No landlords match your search.</p>
      )}

      {status === "active" && filtered.length > 0 && (
        <>
          {/* Mobile card list (mobile experience — independent of the desktop list/cards toggle) */}
          <div className="lg:hidden min-h-0 flex-1 overflow-auto space-y-2">
            {filtered.map((l) => {
              const displayName = l.company_name || `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "Unnamed"
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                    {l.phone && <p className="text-xs text-muted-foreground mt-0.5">{l.phone}</p>}
                    {l.email && <p className="text-xs text-muted-foreground truncate">{l.email}</p>}
                    {l.properties.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">{l.properties.slice(0, 2).join(", ")}{l.properties.length > 2 ? ` +${l.properties.length - 2}` : ""}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.phone && (
                      <a href={`tel:${l.phone}`}>
                        <ActionButton tone="secondary">Call</ActionButton>
                      </a>
                    )}
                    <ActionButton tone="secondary" onClick={() => router.push(`/landlords/${l.id}`)}>→</ActionButton>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table (list view) */}
          {view === "list" && (
          <ListCard fill className="hidden lg:flex">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left"><SortHeader col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell"><SortHeader col="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><SortHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><SortHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-4 py-2.5 text-left hidden xl:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Properties</span>
                </th>
                <th className="px-4 py-2.5 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const displayName = l.company_name || `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "Unnamed"
                const isDeleting = deletingId === l.id
                return (
                  <tr key={l.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/landlords/${l.id}`)}>
                    <td className="px-4 py-3 font-medium">{displayName}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="secondary" className="text-[10px] capitalize">{l.entity_type}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {l.phone || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                      {l.email || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {l.properties.slice(0, 2).map((p) => (
                          <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                        ))}
                        {l.properties.length > 2 && (
                          <Badge variant="secondary" className="text-[10px] text-muted-foreground">+{l.properties.length - 2}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <EditButton label="Edit landlord" onClick={() => setEditId(l.id)} />
                        {isAdmin && (
                          <DeleteButton
                            icon={Archive}
                            label="Archive landlord"
                            title={`Archive ${displayName}?`}
                            itemName="this landlord"
                            description="They leave your active list, but all history is kept and you can restore them anytime. An in-force lease blocks archiving."
                            confirmLabel="Archive"
                            loading={isDeleting}
                            onConfirm={() => handleDelete(l)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </ListCard>
          )}

          {/* Desktop cards grid (cards view) */}
          {view === "cards" && (
            <div className="hidden lg:grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((l) => (
                <LandlordCard
                  key={l.id}
                  l={l}
                  isAdmin={isAdmin}
                  isDeleting={deletingId === l.id}
                  onOpen={() => router.push(`/landlords/${l.id}`)}
                  onEdit={() => setEditId(l.id)}
                  onDelete={() => handleDelete(l)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editId && (
        <EditPartyModal
          role="landlord"
          open={!!editId}
          onOpenChange={(o) => { if (!o) setEditId(null) }}
          fetchData={() => fetchLandlordParty(editId)}
          onSubmit={(input) => updateLandlordParty(input, editId)}
          onSaved={() => {
            if (orgId) {
              queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId) })
              queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
            }
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
