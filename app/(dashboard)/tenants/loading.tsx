import { Skeleton } from "@/components/ui/skeleton"

export default function TenantsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-24 mt-1" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    </div>
  )
}
