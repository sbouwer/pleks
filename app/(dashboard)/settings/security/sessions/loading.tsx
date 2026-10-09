/**
 * app/(dashboard)/settings/security/sessions/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/security/sessions
 * Notes:  SessionsView paints only a centred spinner on the server — its title appears after the client fetch — so
 *         there is nothing to mirror. Without this file the settings/security/loading.tsx category skeleton would flash
 *         first.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
