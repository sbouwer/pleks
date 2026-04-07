import { Skeleton } from "@/components/ui/skeleton"

export default function LeasesLoading() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex gap-2 border-b border-border pb-0">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-24" />)}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    </div>
  )
}
