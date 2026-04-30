/**
 * app/(dashboard)/suppliers/loading.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function ContractorsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-4 w-24 mt-1" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex gap-1 border-b border-border mb-6">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-28 mb-px" />)}
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    </div>
  )
}
