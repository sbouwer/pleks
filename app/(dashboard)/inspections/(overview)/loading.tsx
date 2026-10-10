/**
 * app/(dashboard)/inspections/(overview)/loading.tsx — route skeleton for /inspections
 *
 * Route:  /inspections
 * Notes:  Mirrors the page template (ResourcePageHeader + list) so there's no layout jump.
 */
import { PageSkeleton } from "@/components/ui/page-skeleton"

export default function InspectionsLoading() {
  return <PageSkeleton />
}
