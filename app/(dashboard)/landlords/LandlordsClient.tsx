"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react"
import Link from "next/link"

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
  readonly userRole: string
}

type SortKey = "name" | "email" | "phone" | "type"
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

export function LandlordsClient({ landlords: initial, userRole }: Readonly<Props>) {
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
    .filter((l) => {
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

  async function handleDelete(l: Landlord) {
    setDeletingId(l.id)
    const res = await fetch("/api/landlords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landlordId: l.id, contactId: l.contact_id }),
    })
    setDeletingId(null)
    if (res.ok) { toast.success("Landlord removed"); router.refresh() }
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

      <p className="text-xs text-muted-foreground">{filtered.length} of {initial.length} landlord{initial.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No landlords match your search.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left"><ColHeader col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell"><ColHeader col="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><ColHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell"><ColHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
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
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
                          render={<Link href={`/landlords/${l.id}`} />}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {isOwner && (
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(l)} disabled={isDeleting}>
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
