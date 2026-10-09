/**
 * app/(dashboard)/settings/deposits/loading.tsx — the deposit-interest settings page's own skeleton
 *
 * Route:  /settings/deposits
 * Notes:  Mirrors the SSR paint of this client page: "Finance" title + subtitle → the collapsed organisation-default
 *         interest card → the Bank Feeds card (heading + intro paragraph). The "Property overrides" block appears only
 *         after the properties fetch resolves and is not reserved; BankFeedSection's body height was not established.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function DepositSettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-9 w-32" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <Skeleton className="h-[76px] rounded-xl" />
      <Skeleton className="mt-6 h-[160px] rounded-xl" />
    </div>
  )
}
