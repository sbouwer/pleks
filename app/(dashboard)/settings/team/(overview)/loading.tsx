/**
 * app/(dashboard)/settings/team/(overview)/loading.tsx — the Team & access page's own skeleton
 *
 * Route:  /settings/team
 * Notes:  Mirrors the SSR paint of the default Members tab in a fill layout: a category header (no pill, no facts,
 *         one sub line, the invite action, ONE tab — Members is the only tab every viewer has; Teams/Roles/Transfer
 *         appear by role and tier, and only widen the strip, so nothing below moves) → search + filter toolbar
 *         → the members table skeleton (5 columns, 4 rows). The count line is hidden while loading, so it is not
 *         drawn. The invite button is text in the page; SkDetailHeader draws an icon square.
 */
import { SkDetailHeader, SkListToolbar, SkTable } from "@/components/ui/page-skeleton"

export default function TeamSettingsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SkDetailHeader pill={false} facts={0} sub={1} actions={1} tabs={1} />
      <SkListToolbar filters={1} count={false} />
      <SkTable rows={4} cols={5} />
    </div>
  )
}
