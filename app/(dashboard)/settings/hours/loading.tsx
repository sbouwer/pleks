/**
 * app/(dashboard)/settings/hours/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/hours
 * Notes:  The page is a synchronous redirect to /settings/details?tab=hours and never paints. Without this file the
 *         settings overview skeleton would flash during the redirect.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
