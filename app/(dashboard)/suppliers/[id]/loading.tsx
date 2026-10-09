/**
 * app/(dashboard)/suppliers/[id]/loading.tsx — the supplier detail page's own skeleton
 *
 * Route:  /suppliers/[id]
 * Notes:  Mirrors page.tsx's DetailPageLayout: header with type badge, 4 facts and 4 icon actions → identity,
 *         account profile, banking, portal, active jobs, invoices, full-width performance. Shapes come from
 *         components/ui/page-skeleton; the arrangement is this page's.
 */
import { SkCard, SkDetailGrid, SkDetailHeader, SkFull } from "@/components/ui/page-skeleton"

export default function SupplierDetailLoading() {
  return (
    <div>
      <SkDetailHeader facts={4} actions={4} badge />
      <SkDetailGrid>
        <SkCard rows={4} />
        <SkCard rows={4} />
        <SkCard rows={2} />
        <SkCard rows={2} />
        <SkCard rows={3} />
        <SkCard rows={3} />
        <SkFull><SkCard rows={4} /></SkFull>
      </SkDetailGrid>
    </div>
  )
}
