/**
 * app/(dashboard)/settings/details/loading.tsx — the Organisation page's own skeleton
 *
 * Route:  /settings/details
 * Notes:  Mirrors page.tsx's default Details tab: a DetailPageLayout category header (no pill, no facts, one sub
 *         line, four tabs — three without the hours tab) over OrgDetailsCards in the two-column grid: Organisation
 *         details (5 rows), Contact details (3), Address (1), Banking (1 + one per trust account).
 */
import { SkCard, SkDetailGrid, SkDetailHeader } from "@/components/ui/page-skeleton"

export default function OrgDetailsLoading() {
  return (
    <div>
      <SkDetailHeader pill={false} facts={0} sub={1} actions={0} tabs={4} />
      <SkDetailGrid>
        <SkCard rows={5} />
        <SkCard rows={3} />
        <SkCard rows={1} />
        <SkCard rows={2} />
      </SkDetailGrid>
    </div>
  )
}
