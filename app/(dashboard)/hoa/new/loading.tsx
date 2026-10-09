/**
 * app/(dashboard)/hoa/new/loading.tsx — the new HOA entity form's own skeleton
 *
 * Route:  /hoa/new
 * Notes:  Mirrors page.tsx + NewHOAForm: BackLink → a header row (Back button beside title + subtitle) → the
 *         "Entity details" card (3 fields) and "Registration & compliance" card (4 fields in two columns plus 2 full
 *         rows, drawn as six fields in two columns) → Create / Cancel. All server-rendered; nothing is fetched on
 *         the client.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkFormCard } from "@/components/ui/page-skeleton"

export default function NewHoaLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-16 rounded-[var(--r-button)]" />
          <div>
            <Skeleton className="h-8 w-72" />
            <Skeleton className="mt-0.5 h-4 w-64" />
          </div>
        </div>
        <div className="space-y-4">
          <SkFormCard fields={3} />
          <SkFormCard fields={6} cols={2} />
          <SkButtonRow align="left" />
        </div>
      </div>
    </div>
  )
}
