"use client"

/**
 * app/(dashboard)/suppliers/SuppliersClient.tsx — searchable, sortable supplier/contractor list with add form and inline delete
 *
 * Route:  /suppliers
 * Auth:   dashboard layout (gateway)
 * Data:   contractors prop from server page; invalidates portfolio query cache on delete
 */

import { useState } from "react"
import { EditButton, DeleteButton } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { Badge } from "@/components/ui/badge"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePermissions } from "@/hooks/usePermissions"
import { RotateCcw, Archive } from "lucide-react"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { addContractorParty, fetchContractorParty, updateContractorParty } from "@/lib/actions/parties"
import { fetchArchivedSuppliers, reactivateSupplier, type ArchivedSupplier } from "@/lib/actions/supplierArchive"

// Canonical speciality list lives in lib/parties/partyConfig (single source — re-exported here so
// any existing importer of this module keeps working).
export { SPECIALITY_OPTIONS } from "@/lib/parties/partyConfig"

export interface Contractor {
  id: string
  contact_id: string
  entity_type: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  phone: string | null
  specialities: string[]
  is_active: boolean
}

interface Props {
  contractors: Contractor[]
  orgId: string
  /** noun for the active tab (contractor / managing scheme / utility) — used in counts + empty copy */
  noun?: { singular: string; plural: string }
}

type SortKey = "company" | "contact" | "phone" | "email" | "status"

/** Card-view tile (the "Cards" toggle) — mirrors the list row's data + hover edit/archive actions. */
function SupplierCard({
  c, isAdmin, isDeleting, onOpen, onEdit, onArchive,
}: Readonly<{
  c: Contractor
  isAdmin: boolean
  isDeleting: boolean
  onOpen: () => void
  onEdit: () => void
  onArchive: () => void
}>) {
  const displayName = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed"
  const specs = (c.specialities ?? []).slice(0, 3)
  const extra = (c.specialities ?? []).length - 3
  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {c.entity_type && (
            <p className="text-[11px] text-muted-foreground">{c.entity_type === "organisation" ? "Company" : "Individual"}</p>
          )}
        </div>
        {c.is_active ? (
          <Badge variant="secondary" className="shrink-0 text-[10px] bg-green-500/10 text-green-600 dark:text-green-400">Active</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[10px] bg-surface-elevated">Inactive</Badge>
        )}
      </div>

      {specs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {specs.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px] bg-brand/8 text-brand">{s}</Badge>
          ))}
          {extra > 0 && <Badge variant="secondary" className="text-[10px] bg-surface-elevated text-muted-foreground">+{extra} more</Badge>}
        </div>
      )}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        {c.phone && <p className="truncate">{c.phone}</p>}
        {c.email && <p className="truncate">{c.email}</p>}
        {!c.phone && !c.email && <p className="text-muted-foreground/40">No contact details</p>}
      </div>

      <div
        className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <EditButton label="Edit supplier" onClick={onEdit} />
        {isAdmin && (
          <DeleteButton
            icon={Archive}
            label="Archive supplier"
            title={`Archive ${c.company_name ?? "this supplier"}?`}
            itemName={c.company_name ?? "this supplier"}
            description="They leave your active list, but historical work orders and invoices are kept. Active obligations block removal."
            confirmLabel="Archive"
            loading={isDeleting}
            onConfirm={onArchive}
          />
        )}
      </div>
    </div>
  )
}

export function SuppliersClient({
  contractors: initial, orgId, noun = { singular: "contractor", plural: "contractors" },
}: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "cards">("list")
  const { sortKey, sortDir, onSort } = useListSort<SortKey>("company")

  const { isAdmin } = usePermissions()

  const [status, setStatus] = useState<"active" | "archived">("active")
  const [archived, setArchived] = useState<ArchivedSupplier[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)

  async function changeStatus(v: string) {
    const next = v === "archived" ? "archived" : "active"
    setStatus(next)
    if (next === "archived" && !archivedLoaded && !loadingArchived) {
      setLoadingArchived(true)
      setArchived(await fetchArchivedSuppliers())
      setArchivedLoaded(true)
      setLoadingArchived(false)
    }
  }

  async function handleReactivate(s: ArchivedSupplier) {
    setReactivatingId(s.id)
    const res = await reactivateSupplier(s.id, s.contactId)
    setReactivatingId(null)
    if (res.ok) {
      toast.success("Supplier reactivated")
      setArchived((prev) => prev.filter((x) => x.id !== s.id))
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId) })
      router.refresh()
    } else {
      toast.error(res.error ?? "Could not reactivate")
    }
  }

  const filtered = initial
    .filter((c) => {
      const name = `${c.company_name ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase()
      const matchSearch = !search || name.includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      const matchFilter = categories.length === 0 || (c.specialities ?? []).some((s) => categories.includes(s))
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      let valA = ""
      let valB = ""
      if (sortKey === "company") {
        valA = (a.company_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase()
        valB = (b.company_name || `${b.first_name ?? ""} ${b.last_name ?? ""}`).toLowerCase()
      } else if (sortKey === "contact") {
        valA = `${a.last_name ?? ""} ${a.first_name ?? ""}`.toLowerCase().trim()
        valB = `${b.last_name ?? ""} ${b.first_name ?? ""}`.toLowerCase().trim()
      } else if (sortKey === "phone") {
        valA = a.phone ?? ""
        valB = b.phone ?? ""
      } else if (sortKey === "email") {
        valA = a.email?.toLowerCase() ?? ""
        valB = b.email?.toLowerCase() ?? ""
      } else if (sortKey === "status") {
        valA = a.is_active ? "a" : "b"
        valB = b.is_active ? "a" : "b"
      }
      const cmp = valA.localeCompare(valB)
      return sortDir === "asc" ? cmp : -cmp
    })

  const allSpecialities = Array.from(
    new Set(initial.flatMap((c) => c.specialities ?? []))
  ).sort((a, b) => a.localeCompare(b))

  // Returns { blocked } on a 409 (open work orders / unpaid invoices) so the DeleteButton dialog morphs
  // into an acknowledge view (no toast for the obligation block). Other failures still toast.
  async function handleDelete(c: Contractor): Promise<void | { blocked: string }> {
    setDeletingId(c.id)
    const res = await fetch("/api/suppliers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorId: c.id, contactId: c.contact_id }),
    })
    setDeletingId(null)
    if (res.ok) {
      toast.success("Contractor archived")
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId) })
      router.refresh()
      return
    }
    const d = await res.json().catch(() => ({}))
    if (res.status === 409) return { blocked: d.error || "This supplier has open obligations — resolve them before archiving." }
    toast.error(d.error || "Failed to archive")
  }

  const word = (n: number) => (n === 1 ? noun.singular : noun.plural)
  let countLabel: string
  if (status === "archived") {
    countLabel = `${archived.length} archived ${word(archived.length)}`
  } else {
    const catWord = categories.length === 1 ? "category" : "categories"
    const filterNote = categories.length > 0 ? ` · ${categories.length} ${catWord}` : ""
    countLabel = `${filtered.length} of ${initial.length} ${word(initial.length)}${filterNote}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Joint toolbar: list/grid · specialities dropdown · search */}
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
              onChange={(next) => changeStatus(next[0] ?? "active")}
              options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
            />
            {status === "active" && allSpecialities.length > 0 && (
              <ToolbarFilter
                label="Categories"
                multiple
                selected={categories}
                onChange={setCategories}
                options={allSpecialities.map((s) => ({ value: s, label: s }))}
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
            <p className="text-sm text-muted-foreground py-8 text-center">No archived {noun.plural}.</p>
          )}
          {!loadingArchived && archived.length > 0 && (
            <ListCard fill>
              <div className="divide-y divide-border/50">
                {archived.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">Archived</p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleReactivate(s)}
                        disabled={reactivatingId === s.id}
                        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" /> {reactivatingId === s.id ? "Reactivating…" : "Reactivate"}
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
        <p className="text-sm text-muted-foreground py-8 text-center">No {noun.plural} match your search.</p>
      )}

      {status === "active" && filtered.length > 0 && view === "list" && (
        <ListCard fill>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left">
                  <SortHeader col="company" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">
                  <SortHeader col="contact" label="Primary Contact" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <SortHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <SortHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden xl:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Specialities</span>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortHeader col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const displayName = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed"
                const contactName = c.company_name
                  ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
                  : null
                const isDeleting = deletingId === c.id
                const visibleSpecialities = (c.specialities ?? []).slice(0, 2)
                const extraCount = (c.specialities ?? []).length - 2

                return (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/suppliers/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{displayName}</p>
                      {c.entity_type && (
                        <p className="text-[11px] text-muted-foreground">
                          {c.entity_type === "organisation" ? "Company" : "Individual"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-muted-foreground">
                        {contactName || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-muted-foreground">
                        {c.phone || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {c.email || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {visibleSpecialities.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] bg-brand/8 text-brand">
                            {s}
                          </Badge>
                        ))}
                        {extraCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-surface-elevated text-muted-foreground">
                            +{extraCount} more
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.is_active ? (
                        <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-surface-elevated">Inactive</Badge>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <EditButton label="Edit supplier" onClick={() => setEditId(c.id)} />
                        {isAdmin && (
                          <DeleteButton
                            icon={Archive}
                            label="Archive supplier"
                            title={`Archive ${c.company_name ?? "this supplier"}?`}
                            itemName={c.company_name ?? "this supplier"}
                            description="They leave your active list, but historical work orders and invoices are kept. Active obligations block removal."
                            confirmLabel="Archive"
                            loading={isDeleting}
                            onConfirm={() => handleDelete(c)}
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

      {status === "active" && filtered.length > 0 && view === "cards" && (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <SupplierCard
              key={c.id}
              c={c}
              isAdmin={isAdmin}
              isDeleting={deletingId === c.id}
              onOpen={() => router.push(`/suppliers/${c.id}`)}
              onEdit={() => setEditId(c.id)}
              onArchive={() => handleDelete(c)}
            />
          ))}
        </div>
      )}

      {editId && (
        <EditPartyModal
          role="supplier"
          open={!!editId}
          onOpenChange={(o) => { if (!o) setEditId(null) }}
          fetchData={() => fetchContractorParty(editId)}
          onSubmit={(input) => updateContractorParty(input, editId)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId) })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

export function AddContractorButton({
  orgId, supplierType = "contractor", variant = "default", showPlus = true, labelOverride,
}: Readonly<{
  orgId: string; supplierType?: string
  variant?: "default" | "hero"; showPlus?: boolean; labelOverride?: string
}>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const SUPPLIER_LABELS: Record<string, string> = {
    managing_scheme: "managing scheme",
    utility: "utility",
    contractor: "contractor",
  }
  const label = SUPPLIER_LABELS[supplierType] ?? "contractor"

  return (
    <>
      <AddButton
        label={labelOverride ?? `Add ${label}`}
        variant={variant}
        showPlus={showPlus}
        onClick={() => setOpen(true)}
      />
      <AddPartyModal
        role="supplier"
        open={open}
        onOpenChange={setOpen}
        onSubmit={(input) => addContractorParty(input, supplierType)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId) })
          router.refresh()
        }}
      />
    </>
  )
}
