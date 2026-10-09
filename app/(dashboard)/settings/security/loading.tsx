/**
 * app/(dashboard)/settings/security/loading.tsx — the Security page's own skeleton
 *
 * Route:  /settings/security
 * Notes:  Mirrors page.tsx's default Password & 2FA tab: a DetailPageLayout category header (no pill, no facts, one sub
 *         line, two tabs) over the Password and Two-factor authentication cards in the two-column grid. The card
 *         bodies hold a form and client-managed lists, so their row counts are approximate. The enrol, enrol-totp and
 *         sessions sub-routes have their own files, so none inherits this.
 */
import { SkCard, SkDetailGrid, SkDetailHeader } from "@/components/ui/page-skeleton"

export default function SecurityLoading() {
  return (
    <div>
      <SkDetailHeader pill={false} facts={0} sub={1} actions={0} tabs={2} />
      <SkDetailGrid>
        <SkCard rows={4} />
        <SkCard rows={4} />
      </SkDetailGrid>
    </div>
  )
}
