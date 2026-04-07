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
