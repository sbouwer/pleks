/**
 * app/(dashboard)/settings/security/enrol/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/security/enrol
 * Notes:  A standalone auth-flow page whose first paint is SecureAccount's own custom-CSS card, not dashboard
 *         content. Without this file the settings/security/loading.tsx category skeleton would flash for a page that
 *         looks nothing like it.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
