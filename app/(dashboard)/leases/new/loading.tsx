/**
 * app/(dashboard)/leases/new/loading.tsx — deliberately paints nothing
 *
 * Route:  /leases/new
 * Notes:  The route renders only LeaseWizardModal (a fixed-overlay dialog); nothing is painted behind it. Without
 *         this file leases/loading.tsx (a list skeleton) would flash and then vanish behind the modal.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
