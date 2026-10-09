/**
 * app/(dashboard)/settings/feedback/[id]/loading.tsx — the feedback submission page's own skeleton
 *
 * Route:  /settings/feedback/[id]
 * Notes:  Mirrors page.tsx in a max-w-2xl column: "Back to feedback" link → the submission card → the admin card
 *         (status + internal note) → the reply box. Replies already posted are data-dependent and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkButtonRow, SkField } from "@/components/ui/page-skeleton"

export default function FeedbackDetailLoading() {
  return (
    <div className="max-w-2xl space-y-4">
      <Skeleton className="h-5 w-36" />
      <div className="space-y-6">
        <Skeleton className="h-[150px] rounded-lg" />
        <Skeleton className="h-[130px] rounded-lg" />
        <div className="space-y-2">
          <SkField textarea />
          <SkButtonRow buttons={1} />
        </div>
      </div>
    </div>
  )
}
