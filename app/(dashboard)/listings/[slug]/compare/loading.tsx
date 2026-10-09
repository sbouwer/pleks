/**
 * app/(dashboard)/listings/[slug]/compare/loading.tsx — the compare-applicants page's own skeleton
 *
 * Route:  /listings/[slug]/compare
 * Notes:  Mirrors page.tsx: BackLink → title → one card holding an 8-column table (header + up to COMPARE_LIMIT = 8
 *         rows) and a footnote line.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkTable } from "@/components/ui/page-skeleton"

export default function CompareApplicantsLoading() {
  return (
    <div>
      <SkBackLink />
      <Skeleton className="mb-6 h-9 w-72" />
      <SkTable rows={8} cols={8} />
      <Skeleton className="mt-4 h-3 w-96 max-w-full" />
    </div>
  )
}
