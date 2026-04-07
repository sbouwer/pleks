import { Skeleton } from "@/components/ui/skeleton"

export default function InspectionsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    </div>
  )
}
