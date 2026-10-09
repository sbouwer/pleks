/**
 * app/(dashboard)/settings/privacy/information-officer/loading.tsx — the Information Officer page's own skeleton
 *
 * Route:  /settings/privacy/information-officer
 * Notes:  Mirrors page.tsx's legacy max-w-lg column: title + two-line subtitle → the organisation card holding the
 *         form (name, email, phone, a 3-row postal-address textarea, Save) → the POPIA s73(2) note box. Admins see the
 *         Save button; others see a hint line instead, so the form height is the admin one.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkButtonRow, SkColumn, SkField, SkFormSection, SkPageTitle } from "@/components/ui/page-skeleton"

export default function InformationOfficerLoading() {
  return (
    <SkColumn width="lg" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 pt-4"><Skeleton className="h-4 w-48" /></div>
        <div className="space-y-4 p-4">
          <SkFormSection heading={false} fields={3} />
          <SkField textarea />
          <SkButtonRow buttons={1} align="left" />
        </div>
      </div>
      <Skeleton className="h-[88px] rounded-md" />
    </SkColumn>
  )
}
