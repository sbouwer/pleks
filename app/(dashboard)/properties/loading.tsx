import { Skeleton } from "@/components/ui/skeleton"

export default function PropertiesLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  )
}
