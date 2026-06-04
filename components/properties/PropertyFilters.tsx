"use client"

/**
 * components/properties/PropertyFilters.tsx — properties list toolbar (status · occupancy · search · list/cards)
 *
 * Route:  /properties (Portfolio / Firm tier filterable list)
 * Auth:   rendered inside PropertyListView under gatewaySSR (parent page)
 * Data:   none — drives the q/status/archived/view URL searchParams the server page reads
 * Notes:  Shared <ListToolbar>. Status = Active/Archived (archived = soft-deleted properties; "1" on the
 *         `archived` param). Occupancy (vacancies/fully-occupied) only shows on the active view. URL-backed.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { ListToolbar, ToolbarFilter } from "@/components/ui/resource-list"

interface PropertyFiltersProps {
  view: "list" | "cards"
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
]

const OCCUPANCY_OPTIONS = [
  { value: "vacancies", label: "Has vacancies" },
  { value: "occupied", label: "Fully occupied" },
]

export function PropertyFilters({ view }: PropertyFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const set = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const q = searchParams.get("q") ?? ""
  const status = searchParams.get("status") ?? ""
  const archived = searchParams.get("archived") === "1"

  return (
    <div className="mb-5">
      <ListToolbar
        search={q}
        onSearch={(v) => set("q", v)}
        placeholder="Search properties…"
        view={view}
        onView={(v) => set("view", v)}
        filters={
          <>
            <ToolbarFilter
              label="Status"
              selected={[archived ? "archived" : "active"]}
              onChange={(next) => set("archived", next.includes("archived") ? "1" : "")}
              options={STATUS_OPTIONS}
            />
            {!archived && (
              <ToolbarFilter
                label="Occupancy"
                selected={status ? [status] : []}
                onChange={(next) => set("status", next[0] ?? "")}
                options={OCCUPANCY_OPTIONS}
              />
            )}
          </>
        }
      />
    </div>
  )
}
