/**
 * app/(dashboard)/statements/loading.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function StatementsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    </div>
  )
}
