/**
 * app/(dashboard)/settings/team/sessions/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/team/sessions
 * Notes:  TeamSessionsView paints only a centred spinner on the server — its title appears after the client fetch — so
 *         there is nothing to mirror. Without this file the settings/team/loading.tsx members skeleton would flash
 *         first.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
