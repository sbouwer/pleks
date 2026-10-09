/**
 * app/(dashboard)/settings/lease-templates/loading.tsx — the master lease template page's own skeleton
 *
 * Route:  /settings/lease-templates
 * Notes:  LeaseDisclaimerGate's loading branch paints the page body itself (blurred, behind the consent check), so this
 *         mirrors that body: title + three explanatory paragraphs → the lease-source and branding sections → the
 *         residential/commercial toggle with the Preview button → four clause sub-tabs. The clause lists load
 *         client-side and are not reserved; the intro banner and the confirmation bar are client state and are not
 *         reserved either. The lease-source and branding blocks are drawn as plain blocks (heights not measured).
 *         Below lg the page swaps to a DesktopOnlyCard; this keeps the desktop shape.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function LeaseTemplatesLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-9 w-80" />
      <Skeleton className="mb-1 h-4 w-[40rem] max-w-full" />
      <Skeleton className="mb-3 h-3.5 w-[44rem] max-w-full" />
      <Skeleton className="mb-6 h-3.5 w-[36rem] max-w-full" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-[88px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-56 rounded-[var(--r-button)]" />
          <Skeleton className="h-9 w-36 rounded-[var(--r-button)]" />
        </div>
        <Skeleton className="h-9 w-[28rem] max-w-full rounded-[var(--r-button)]" />
      </div>
    </div>
  )
}
