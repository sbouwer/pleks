/**
 * app/(dashboard)/settings/subscription/confirm-cancel/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/subscription/confirm-cancel
 * Notes:  The page runs confirmCancellation() (a mutating server action) and always redirects; it never paints a body.
 *         Without this file the settings/subscription/loading.tsx skeleton would flash while the action runs.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
