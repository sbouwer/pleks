/**
 * app/(dashboard)/settings/notifications/loading.tsx — the Notifications page's own skeleton
 *
 * Route:  /settings/notifications
 * Notes:  Mirrors the SSR paint: a DetailPageLayout category header (no pill, no facts, one sub line, two tabs) and
 *         nothing under it. NotificationsForm fetches in an effect and paints only a "Loading…" line on the server, so
 *         no body is reserved.
 */
import { SkDetailHeader } from "@/components/ui/page-skeleton"

export default function NotificationsSettingsLoading() {
  return <SkDetailHeader pill={false} facts={0} sub={1} actions={0} tabs={2} />
}
