/**
 * app/(dashboard)/listings/(overview)/loading.tsx — the listings list's own skeleton
 *
 * Route:  /listings
 * Notes:  Mirrors ListingsPageClient's SSR paint (rows arrive as props): header with the New listing action →
 *         status filter + search toolbar with its count line → a 5-column table. The right-hand "View" scope filter
 *         is client-resolved (useShowScopeFilter) and not reserved; an empty org paints an empty state instead.
 */
import { ResourcePageHeaderSkeleton, SkListToolbar, SkTable } from "@/components/ui/page-skeleton"

export default function ListingsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeaderSkeleton actions={1} />
      <SkListToolbar filters={1} count />
      <SkTable rows={8} cols={5} />
    </div>
  )
}
