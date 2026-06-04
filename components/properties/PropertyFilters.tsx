"use client"

/**
 * components/properties/PropertyFilters.tsx — properties list toolbar (search · status filter · list/cards toggle)
 *
 * Route:  /properties (Portfolio / Firm tier filterable list)
 * Auth:   rendered inside PropertyListView under gatewaySSR (parent page)
 * Data:   none — purely drives the q/status/view URL searchParams the server page reads
 * Notes:  Uses the shared <ListToolbar> (components/ui/resource-list) so it matches the other lists.
 *         State is URL-backed (router.push) — refresh/back restores filters. "All statuses" = empty
 *         selected array; a chosen status maps to the `status` param.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { ListToolbar, ToolbarFilter } from "@/components/ui/resource-list"

interface PropertyFiltersProps {
  view: "list" | "cards"
}

const STATUS_OPTIONS = [
  { value: "vacancies", label: "Has vacancies" },
  { value: "occupied", label: "Fully occupied" },
  { value: "arrears", label: "Has arrears" },
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

  return (
    <div className="mb-5">
      <ListToolbar
        search={q}
        onSearch={(v) => set("q", v)}
        placeholder="Search properties…"
        view={view}
        onView={(v) => set("view", v)}
        filters={
          <ToolbarFilter
            label="Status"
            selected={status ? [status] : []}
            onChange={(next) => set("status", next[0] ?? "")}
            options={STATUS_OPTIONS}
          />
        }
      />
    </div>
  )
}
