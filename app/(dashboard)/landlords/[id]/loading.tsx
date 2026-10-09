/**
 * app/(dashboard)/landlords/[id]/loading.tsx — the landlord detail page's own skeleton
 *
 * Route:  /landlords/[id]
 * Notes:  Mirrors page.tsx's DetailPageLayout: header with 4 facts and the quickbar → identity, contact,
 *         address, bank, payment, portal sections → full-width properties and financial summary. Shapes come
 *         from components/ui/page-skeleton; the arrangement is this page's. No slot for WelcomePackBanner: it
 *         renders nothing until a useEffect reads localStorage, so the page's first paint has no banner either.
 *         The nested ledger page inherits this skeleton until it gets its own loading.tsx.
 */
import { SkCard, SkDetailGrid, SkDetailHeader, SkFull } from "@/components/ui/page-skeleton"

export default function LandlordDetailLoading() {
  return (
    <div>
      <SkDetailHeader facts={4} actions={4} />
      <SkDetailGrid>
        <SkCard rows={4} header="inline" />
        <SkCard rows={2} header="inline" />
        <SkCard rows={1} header="inline" />
        <SkCard rows={2} header="inline" />
        <SkCard rows={2} header="inline" />
        <SkCard rows={2} header="inline" />
        <SkFull><SkCard rows={2} /></SkFull>
        <SkFull><SkCard rows={2} /></SkFull>
      </SkDetailGrid>
    </div>
  )
}
