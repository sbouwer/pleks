/**
 * app/(dashboard)/listings/[slug]/loading.tsx — the listing page's own skeleton
 *
 * Route:  /listings/[slug]
 * Notes:  Mirrors page.tsx: detail header (title + status pill, six facts, up to four quickbar icons) → the
 *         applications triage list (decision filter + search + count, then a 6-column table). The checkbox column
 *         comes from usePermissions on the client and is not reserved; a listing with no applications paints an
 *         empty state instead.
 */
import { SkDetailHeader, SkListToolbar, SkTable } from "@/components/ui/page-skeleton"

export default function ListingDetailLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SkDetailHeader facts={6} actions={4} />
      <SkListToolbar filters={1} count />
      <SkTable rows={6} cols={6} />
    </div>
  )
}
