/**
 * app/(dashboard)/settings/configuration/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/configuration
 * Notes:  The page is a synchronous redirect to /settings/details?tab=configuration and never paints. Without this
 *         file the settings overview skeleton would flash during the redirect.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
