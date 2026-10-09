/**
 * app/(dashboard)/listings/[slug]/applications/[id]/loading.tsx — the application page's own skeleton
 *
 * Route:  /listings/[slug]/applications/[id]
 * Notes:  Mirrors page.tsx's default "applicant" tab: detail header (name + status pill + applicant-type badge,
 *         property sub line, four facts, 2–3 action buttons, three in-header tabs) → applicant card and documents
 *         card side by side → full-width motivation and agent-notes cards. The header's actions are text buttons in
 *         the page but SkDetailHeader draws icon squares, so their width is approximate. The foreign-national banner
 *         and marital-flags card are conditional and not reserved.
 */
import { SkCard, SkDetailGrid, SkDetailHeader, SkFull } from "@/components/ui/page-skeleton"

export default function ApplicationDetailLoading() {
  return (
    <div>
      <SkDetailHeader facts={4} actions={3} badge sub={1} tabs={3} />
      <SkDetailGrid>
        <SkCard rows={7} />
        <SkCard rows={3} />
        <SkFull><SkCard rows={1} /></SkFull>
        <SkFull><SkCard rows={1} /></SkFull>
      </SkDetailGrid>
    </div>
  )
}
