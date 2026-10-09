/**
 * app/(dashboard)/settings/profile/loading.tsx — the My profile page's own skeleton
 *
 * Route:  /settings/profile
 * Notes:  Mirrors page.tsx's default Personal tab: a DetailPageLayout category header (no pill, no facts, one sub
 *         line, two tabs) over MyProfileCards — Personal information (8 rows), Address (3 rows) and the photo card in
 *         one full-width 3-up grid. The optional identity-fork banner above the header is conditional and not
 *         reserved. The photo card is drawn as a 3-row card (its content was not measured).
 */
import { SkCard, SkDetailGrid, SkDetailHeader, SkFull } from "@/components/ui/page-skeleton"

export default function ProfileLoading() {
  return (
    <div>
      <SkDetailHeader pill={false} facts={0} sub={1} actions={0} tabs={2} />
      <SkDetailGrid>
        <SkFull>
          <div className="grid gap-4 md:grid-cols-3">
            <SkCard rows={8} />
            <SkCard rows={3} />
            <SkCard rows={3} />
          </div>
        </SkFull>
      </SkDetailGrid>
    </div>
  )
}
