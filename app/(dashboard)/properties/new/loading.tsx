/**
 * app/(dashboard)/properties/new/loading.tsx — deliberately paints nothing
 *
 * Route:  /properties/new
 * Notes:  The route renders only PropertyWizardModal (a Base UI dialog portal); nothing is painted behind it.
 *         Without this file properties/loading.tsx (a cards skeleton) would flash and then vanish behind the modal.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
