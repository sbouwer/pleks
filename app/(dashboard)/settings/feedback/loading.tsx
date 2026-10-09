/**
 * app/(dashboard)/settings/feedback/loading.tsx — the feedback inbox's own skeleton
 *
 * Route:  /settings/feedback
 * Notes:  Mirrors page.tsx in a max-w-3xl column: title + subtitle → the FeedbackInbox list card (rows of status chip,
 *         subject, excerpt and date). Submissions are unbounded, so five stand in; an empty inbox paints a sentence.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkPageTitle } from "@/components/ui/page-skeleton"

export default function FeedbackInboxLoading() {
  return (
    <div className="max-w-3xl space-y-4">
      <SkPageTitle size="xl" sub={1} className="" />
      <div className="divide-y divide-border rounded-lg border border-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-3 w-96 max-w-full" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
