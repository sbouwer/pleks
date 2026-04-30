/**
 * app/(dashboard)/reports/loading.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function ReportsLoading() {
  return (
    <div>
      <Skeleton className="h-9 w-28 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    </div>
  )
}
