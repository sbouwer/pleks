/**
 * app/(dashboard)/settings/privacy/loading.tsx — the Privacy & POPIA hub's own skeleton
 *
 * Route:  /settings/privacy
 * Notes:  Mirrors page.tsx's legacy max-w-2xl centred column: title + two-line subtitle → one card of five navigation
 *         rows (icon, label + description, chevron). No server data.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn, SkPageTitle } from "@/components/ui/page-skeleton"

export default function PrivacyHubLoading() {
  return (
    <SkColumn width="2xl" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="size-5 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="size-4 shrink-0" />
          </div>
        ))}
      </div>
    </SkColumn>
  )
}
