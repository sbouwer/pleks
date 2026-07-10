"use client"

/**
 * app/(dashboard)/listings/ListingsPageClient.tsx — the rental listings list (level 1 of the drill-down)
 *
 * Route:  /listings
 * Auth:   dashboard layout (server page is org-scoped)
 * Data:   listings prop (each row = one listing + its SUBMITTED application count) from the server page
 * Notes:  Canonical resource-list (ListToolbar + SortHeader + ListCard), like Properties/Leases. Rows are
 *         LISTINGS (not applications); each opens its submitted applications at /listings/[slug]. "My work"
 *         scopes to listings the user is responsible for (unit's assigned agent ?? property's managing agent).
 */
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { AddButton } from "@/components/ui/add-button"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { useUser } from "@/hooks/useUser"
import { useShowScopeFilter } from "@/hooks/useShowScopeFilter"
import { Building2, User, Globe } from "lucide-react"
import { fmtDateZA } from "@/lib/dates"

export interface ListingListRow {
  id: string
  slug: string | null
  unitNumber: string
  propertyName: string
  askingRentCents: number
  status: string
  closesAt: string | null
  createdAt: string
  responsibleAgentId: string | null
  submittedCount: number
}

type ListingSortKey = "property" | "applications" | "rent" | "created" | "closes"

/** Short cut-off date, or a dash when the listing has no closing date set. */
function closesLabel(iso: string | null): string {
  if (!iso) return "—"
  return fmtDateZA(iso)
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "filled", label: "Filled" },
  { value: "expired", label: "Expired" },
]

export function ListingsPageClient({ listings }: Readonly<{ listings: ListingListRow[] }>) {
  const router = useRouter()
  const { user } = useUser()
  const showScope = useShowScopeFilter()
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [search, setSearch] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const { sortKey, sortDir, onSort } = useListSort<ListingSortKey>("created", "desc")

  // My work = listings I'm responsible for (the responsible agent), below Portfolio everyone sees All.
  const effScope = showScope ? scope : "all"
  const userId = user?.id ?? null
  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    const rows = listings.filter((l) => {
      if (effScope === "mine" && userId && l.responsibleAgentId !== userId) return false
      if (statuses.length > 0 && !statuses.includes(l.status)) return false
      if (q && !`${l.unitNumber} ${l.propertyName}`.toLowerCase().includes(q)) return false
      return true
    })
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === "property") cmp = `${a.propertyName} ${a.unitNumber}`.localeCompare(`${b.propertyName} ${b.unitNumber}`)
      else if (sortKey === "applications") cmp = a.submittedCount - b.submittedCount
      else if (sortKey === "rent") cmp = a.askingRentCents - b.askingRentCents
      else if (sortKey === "closes") cmp = (a.closesAt ?? "9999").localeCompare(b.closesAt ?? "9999")
      else cmp = a.createdAt.localeCompare(b.createdAt)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [listings, effScope, userId, statuses, q, sortKey, sortDir])

  const isFiltering = q.length > 0 || statuses.length > 0 || effScope === "mine"
  const countLabel = isFiltering ? `${filtered.length} of ${listings.length} listings` : `${listings.length} listings`

  if (listings.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <EmptyResourceState
          eyebrow="Operations"
          title="Listings"
          headline="Rental listings"
          emptyTitle="No active listings"
          emptySub="Listings are created from a unit. Once published, applicants apply via a shareable link and you'll review, shortlist and screen them here."
          icon={<Building2 className="h-6 w-6" />}
          heroAction={<AddButton label="Go to properties" showPlus={false} onClick={() => router.push("/properties")} />}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        eyebrow="Operations"
        title="Listings"
        headline="Rental listings"
        action={<AddButton label="New listing" onClick={() => router.push("/properties")} />}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by unit or property…"
          rightFilters={
            showScope ? (
              <ToolbarFilter
                label="View"
                selected={[scope]}
                onChange={(next) => setScope((next[0] as "mine" | "all") ?? "mine")}
                options={[
                  { value: "mine", label: "My work", icon: <User /> },
                  { value: "all", label: "All", icon: <Globe /> },
                ]}
              />
            ) : null
          }
          filters={
            <ToolbarFilter label="Status" multiple selected={statuses} onChange={setStatuses} options={STATUS_OPTIONS} />
          }
        />
        <p className="text-xs text-muted-foreground">{countLabel}</p>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No listings match your filters.</p>
        ) : (
          <ListCard fill>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[16%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-border/60 bg-card">
                <tr>
                  <th className="px-3 py-2.5 text-left"><SortHeader col="property" label="Property / Unit" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-3 py-2.5 text-left"><SortHeader col="applications" label="Applications" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-3 py-2.5 text-left"><SortHeader col="rent" label="Rent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-3 py-2.5 text-left"><SortHeader col="closes" label="Closes" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => l.slug && router.push(`/listings/${l.slug}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="truncate px-3 py-3">
                      <span className="font-medium">{l.unitNumber}</span>
                      <span className="text-muted-foreground">, {l.propertyName}</span>
                    </td>
                    <td className="px-3 py-3">
                      {l.submittedCount > 0
                        ? <span className="font-medium">{l.submittedCount}</span>
                        : <span className="text-muted-foreground">—</span>}
                      <span className="text-muted-foreground"> {l.submittedCount === 1 ? "application" : "applications"}</span>
                    </td>
                    <td className="px-3 py-3">{formatZAR(l.askingRentCents)}<span className="text-muted-foreground">/mo</span></td>
                    <td className="px-3 py-3 text-muted-foreground">{closesLabel(l.closesAt)}</td>
                    <td className="px-3 py-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListCard>
        )}
      </div>
    </div>
  )
}
