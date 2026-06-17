/**
 * app/(dashboard)/settings/branding/page.tsx — legacy route → Organisation › Branding tab
 *
 * Route:  /settings/branding (redirects to /settings/details?tab=branding)
 * Notes:  Branding folded into the Organisation category page (BrandingForm panel). Kept as a redirect so
 *         existing bookmarks/deep-links still resolve to the tab.
 */
import { redirect } from "next/navigation"

export default function BrandingRedirect() {
  redirect("/settings/details?tab=branding")
}
