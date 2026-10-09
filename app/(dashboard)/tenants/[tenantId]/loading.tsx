/**
 * app/(dashboard)/tenants/[tenantId]/loading.tsx — the tenant detail page's own skeleton
 *
 * Route:  /tenants/[tenantId]
 * Notes:  Mirrors page.tsx's desktop DetailPageLayout: header with 3 facts and the quickbar → contact, identity,
 *         employment, address sections → full-width current lease, payment status, active maintenance.
 *         Below lg the page swaps to MobileTenantView; this skeleton keeps the desktop shape.
 */
import { SkCard, SkDetailGrid, SkDetailHeader, SkFull } from "@/components/ui/page-skeleton"

export default function TenantDetailLoading() {
  return (
    <div>
      <SkDetailHeader facts={3} actions={3} />
      <SkDetailGrid>
        <SkCard rows={2} header="inline" />
        <SkCard rows={5} header="inline" />
        <SkCard rows={5} header="inline" />
        <SkCard rows={1} header="inline" />
        <SkFull><SkCard rows={1} /></SkFull>
        <SkFull><SkCard rows={2} /></SkFull>
        <SkFull><SkCard rows={2} /></SkFull>
      </SkDetailGrid>
    </div>
  )
}
