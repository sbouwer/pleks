/**
 * app/(dashboard)/settings/branding/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/branding
 * Notes:  The page is a synchronous redirect to /settings/details?tab=branding and never paints. Without this file the
 *         settings overview skeleton would flash during the redirect.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
