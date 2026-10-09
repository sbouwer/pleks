/**
 * app/(dashboard)/landlords/[id]/ledger/loading.tsx — the landlord ledger's own skeleton
 *
 * Route:  /landlords/[id]/ledger
 * Notes:  Mirrors page.tsx in a max-w-4xl centred column: back link → title + subtitle → 4 summary tiles → one
 *         7-column ledger table (Date, Type, Property, Ref, In, Out, Balance). Rows are data-dependent (eight stand
 *         in); the table's own title bar is not drawn. A landlord with no properties paints a sentence instead.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkPageTitle, SkStatCards, SkTable } from "@/components/ui/page-skeleton"

export default function LandlordLedgerLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div>
        <Skeleton className="mb-2 h-4 w-28" />
        <SkPageTitle size="2xl" sub={1} className="" />
      </div>
      <SkStatCards className="h-[72px]" />
      <SkTable rows={8} cols={7} />
    </div>
  )
}
