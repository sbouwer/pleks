"use client"

/**
 * app/(dashboard)/tenants/TenantsClient.tsx — searchable, sortable tenant list with inline delete
 *
 * Route:  /tenants
 * Auth:   dashboard layout (gateway)
 * Data:   tenants prop from server page; invalidates portfolio query cache on delete
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ActionButton, EditButton, IconButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { ListSearchBar, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { useOrg } from "@/hooks/useOrg"
import { usePermissions } from "@/hooks/usePermissions"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { fetchTenantParty, updateTenantParty } from "@/lib/actions/parties"

interface Tenant {
  id: string
  contact_id: string
  entity_type: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  phone: string | null
}

interface Props {
  readonly tenants: Tenant[]
}

type SortKey = "name" | "type" | "email" | "phone"

export function TenantsClient({ tenants: initial }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const { isAdmin } = usePermissions()
  const [search, setSearch] = useState("")
  const { sortKey, sortDir, onSort } = useListSort<SortKey>("name")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const filtered = initial
    .filter((t) => {
      if (!search) return true
      const name = (t.company_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`).toLowerCase()
      return name.includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase()) ||
        t.phone?.includes(search)
    })
    .sort((a, b) => {
      const nameA = (a.company_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase()
      const nameB = (b.company_name || `${b.first_name ?? ""} ${b.last_name ?? ""}`).toLowerCase()
      let valA = "", valB = ""
      if (sortKey === "name") { valA = nameA; valB = nameB }
      else if (sortKey === "type") { valA = a.entity_type; valB = b.entity_type }
      else if (sortKey === "email") { valA = a.email?.toLowerCase() ?? ""; valB = b.email?.toLowerCase() ?? "" }
      else if (sortKey === "phone") { valA = a.phone ?? ""; valB = b.phone ?? "" }
      const cmp = valA.localeCompare(valB)
      return sortDir === "asc" ? cmp : -cmp
    })

  async function handleDelete(t: Tenant) {
    setDeletingId(t.id)
    const res = await fetch("/api/tenants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: t.id, contactId: t.contact_id }),
    })
    setDeletingId(null)
    if (res.ok) {
      toast.success("Tenant removed")
      if (orgId) queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId) })
      router.refresh()
    }
    else { const d = await res.json(); toast.error(d.error || "Failed to delete") }
  }

  return (
    <div className="space-y-4">
      <ListSearchBar value={search} onChange={setSearch} placeholder="Search by name, email or phone…" />

      <p className="text-xs text-muted-foreground">{filtered.length} of {initial.length} tenant{initial.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No tenants match your search.</p>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="lg:hidden space-y-2">
            {filtered.map((t) => {
              const displayName = t.company_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Unnamed"
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                    {t.phone && <p className="text-xs text-muted-foreground mt-0.5">{t.phone}</p>}
                    {t.email && <p className="text-xs text-muted-foreground truncate">{t.email}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {t.phone && (
                      <a href={`tel:${t.phone}`}>
                        <ActionButton tone="secondary">Call</ActionButton>
                      </a>
                    )}
                    <ActionButton tone="secondary" onClick={() => router.push(`/tenants/${t.id}`)}>→</ActionButton>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <ListCard className="hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left"><SortHeader col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell"><SortHeader col="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell"><SortHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell"><SortHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-4 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const displayName = t.company_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Unnamed"
                  return (
                    <tr key={t.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/tenants/${t.id}`)}>
                      <td className="px-4 py-3 font-medium">{displayName}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="secondary" className="text-[10px] capitalize">{t.entity_type}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                        {t.phone || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                        {t.email || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <EditButton label="Edit tenant" onClick={() => setEditId(t.id)} />
                          {isAdmin && (
                            <IconButton
                              icon={<Trash2 className="size-3.5" />}
                              label="Delete tenant"
                              onClick={() => handleDelete(t)}
                              disabled={deletingId === t.id}
                              className="pa-iconbtn--destructive"
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
        </>
      )}

      {editId && (
        <EditPartyModal
          role="tenant"
          open={!!editId}
          onOpenChange={(o) => { if (!o) setEditId(null) }}
          fetchData={() => fetchTenantParty(editId)}
          onSubmit={(input) => updateTenantParty(input, editId)}
          onSaved={() => {
            if (orgId) queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId) })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
