"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react"
import Link from "next/link"

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
  readonly userRole: string
}

type SortKey = "name" | "type" | "email" | "phone"
type SortDir = "asc" | "desc"

function SortIcon({ col, sortKey, sortDir }: Readonly<{ col: SortKey; sortKey: SortKey; sortDir: SortDir }>) {
  if (col !== sortKey) return <ArrowUpDown className="size-3.5 text-muted-foreground/50 ml-1 inline" />
  return sortDir === "asc"
    ? <ArrowUp className="size-3.5 text-brand ml-1 inline" />
    : <ArrowDown className="size-3.5 text-brand ml-1 inline" />
}

function ColHeader({ col, label, sortKey, sortDir, onSort }: Readonly<{ col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (col: SortKey) => void }>) {
  return (
    <button type="button" onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
      {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </button>
  )
}

export function TenantsClient({ tenants: initial, userRole }: Readonly<Props>) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isOwner = userRole === "owner"

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(col); setSortDir("asc") }
  }

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
    if (res.ok) { toast.success("Tenant removed"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to delete") }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name, email or phone…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <button onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} of {initial.length} tenant{initial.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No tenants match your search.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left"><ColHeader col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell"><ColHeader col="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><ColHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><ColHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
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
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
                          render={<Link href={`/tenants/${t.id}`} />}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {isOwner && (
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(t)} disabled={deletingId === t.id}>
                            <Trash2 className="size-3.5" />
                          </Button>
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
