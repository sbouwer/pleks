/**
 * app/(dashboard)/properties/loading.tsx — route skeleton for /properties
 *
 * Route:  /properties
 * Notes:  Mirrors the page template (ResourcePageHeader + card grid) so there's no layout jump.
 */
import { PageSkeleton } from "@/components/ui/page-skeleton"

export default function PropertiesLoading() {
  return <PageSkeleton variant="cards" />
}
