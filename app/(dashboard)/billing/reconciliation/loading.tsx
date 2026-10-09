/**
 * app/(dashboard)/billing/reconciliation/loading.tsx — the reconciliation page's own skeleton
 *
 * Route:  /billing/reconciliation
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors the desktop SSR paint: the "Upload Statement" card only.
 *         Import history and feed connections load in effects, so the server paints an empty state there and none
 *         of it is reserved; the tier-dependent feed card and upsell are absent at first paint. Below lg the page
 *         swaps to a DesktopOnlyCard; this keeps the desktop shape.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function ReconciliationLoading() {
  return <Skeleton className="mb-6 h-[190px] rounded-xl" />
}
