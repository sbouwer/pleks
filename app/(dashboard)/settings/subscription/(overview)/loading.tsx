/**
 * app/(dashboard)/settings/subscription/(overview)/loading.tsx — the Billing (subscription) page's own skeleton
 *
 * Route:  /settings/subscription
 * Notes:  Mirrors the SSR paint of this client page: "Billing" title → the plan card → the usage card. On the server the
 *         tier defaults to owner and swaps after the client fetch, so the plan card is drawn at the owner-plan size and
 *         the status banners (paused, pending cancellation, cancelled, trial) are not reserved. Card heights were
 *         estimated, not measured.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function SubscriptionLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-[240px] rounded-xl" />
      <Skeleton className="h-[160px] rounded-xl" />
    </div>
  )
}
