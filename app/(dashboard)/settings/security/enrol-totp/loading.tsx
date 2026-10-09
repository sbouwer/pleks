/**
 * app/(dashboard)/settings/security/enrol-totp/loading.tsx — deliberately paints nothing
 *
 * Route:  /settings/security/enrol-totp
 * Notes:  A standalone auth-flow page: EnrolTotp starts its enrolment in an effect, so there is no stable first paint
 *         to mirror. Without this file the settings/security/loading.tsx category skeleton would flash for a page
 *         that looks nothing like it.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
