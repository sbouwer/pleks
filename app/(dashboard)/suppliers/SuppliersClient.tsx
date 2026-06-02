"use client"

/**
 * app/(dashboard)/suppliers/SuppliersClient.tsx — searchable, sortable supplier/contractor list with add form and inline delete
 *
 * Route:  /suppliers
 * Auth:   dashboard layout (gateway)
 * Data:   contractors prop from server page; invalidates portfolio query cache on delete
 */

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ActionButton, EditButton, IconButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePermissions } from "@/hooks/usePermissions"
import {
  Search, Trash2, X, Plus,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { addContractorParty } from "@/lib/actions/parties"

// Canonical speciality list lives in lib/parties/partyConfig (single source — re-exported here so
// any existing importer of this module keeps working).
export { SPECIALITY_OPTIONS } from "@/lib/parties/partyConfig"

export interface Contractor {
  id: string
  contact_id: string
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
}

type SortKey = "company" | "contact" | "phone" | "email" | "status"
type SortDir = "asc" | "desc"

function SortIcon({ col, sortKey, sortDir }: Readonly<{ col: SortKey; sortKey: SortKey; sortDir: SortDir }>) {
  if (col !== sortKey) return <ArrowUpDown className="size-3.5 text-muted-foreground/50 ml-1 inline" />
  return sortDir === "asc"
    ? <ArrowUp className="size-3.5 text-brand ml-1 inline" />
    : <ArrowDown className="size-3.5 text-brand ml-1 inline" />
}

function ColHeader({ col, label, sortKey, sortDir, onSort }: Readonly<{ col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (col: SortKey) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </button>
  )
}

export function SuppliersClient({ contractors: initial, orgId }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("company")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const { isAdmin } = usePermissions()

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(col)
      setSortDir("asc")
    }
  }

  const filtered = initial
    .filter((c) => {
      const name = `${c.company_name ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase()
      const matchSearch = !search || name.includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      const matchFilter = !activeFilter || (c.specialities ?? []).includes(activeFilter)
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

  async function handleDelete(c: Contractor) {
    setDeletingId(c.id)
    const res = await fetch("/api/suppliers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorId: c.id, contactId: c.contact_id }),
    })
    setDeletingId(null)
    if (res.ok) {
      toast.success("Contractor removed")
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId) })
      router.refresh()
    } else {
      const d = await res.json()
      toast.error(d.error || "Failed to delete")
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {allSpecialities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allSpecialities.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveFilter(activeFilter === s ? null : s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeFilter === s
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-border text-muted-foreground hover:border-brand/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {initial.length} contractor{initial.length === 1 ? "" : "s"}
        {activeFilter && ` · filtered by "${activeFilter}"`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No contractors match your search.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left">
                  <ColHeader col="company" label="Company" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">
                  <ColHeader col="contact" label="Primary Contact" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <ColHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <ColHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden xl:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Specialities</span>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <ColHeader col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                        <EditButton label="Edit supplier" onClick={() => router.push(`/suppliers/${c.id}`)} />
                        {isAdmin && (
                          <IconButton
                            icon={<Trash2 className="size-3.5" />}
                            label="Delete supplier"
                            onClick={() => handleDelete(c)}
                            disabled={isDeleting}
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
        </div>
      )}
    </div>
  )
}

export function AddContractorButton({ orgId, supplierType = "contractor" }: Readonly<{ orgId: string; supplierType?: string }>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const SUPPLIER_LABELS: Record<string, string> = {
    managing_scheme: "Managing Scheme",
    utility: "Utility",
    contractor: "Contractor",
  }
  const label = SUPPLIER_LABELS[supplierType] ?? "Contractor"

  return (
    <>
      <ActionButton tone="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
        Add {label}
      </ActionButton>
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
