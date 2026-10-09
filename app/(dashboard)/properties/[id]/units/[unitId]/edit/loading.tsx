/**
 * app/(dashboard)/properties/[id]/units/[unitId]/edit/loading.tsx — deliberately paints nothing
 *
 * Route:  /properties/[id]/units/[unitId]/edit
 * Notes:  The page is a pure redirect() with no render. Without this file the inherited properties/[id]/loading.tsx
 *         skeleton would flash for a page that never paints.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
