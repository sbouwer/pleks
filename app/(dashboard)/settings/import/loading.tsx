/**
 * app/(dashboard)/settings/import/loading.tsx — the portfolio import wizard's own skeleton
 *
 * Route:  /settings/import
 * Notes:  Mirrors the SSR paint of this client page: the step bar is hidden on the upload step, so the first paint is
 *         Step0Upload alone — a narrow centred column with the title, a subtitle and the dashed dropzone card. Later
 *         wizard steps are client state and are not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function ImportWizardLoading() {
  return (
    <div className="mx-auto max-w-lg">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <Skeleton className="h-[176px] rounded-xl" />
    </div>
  )
}
