/**
 * app/(dashboard)/settings/hours/page.tsx — legacy route → Organisation › Hours tab
 *
 * Route:  /settings/hours (redirects to /settings/details?tab=hours)
 * Notes:  Opening hours folded into the Organisation category page (HoursForm panel). The hours tab is
 *         capability-gated there (caps.hasOpeningHours) and falls back to Details when unavailable, so a
 *         plain redirect is safe. Kept so existing bookmarks/deep-links still resolve.
 */
import { redirect } from "next/navigation"

export default function HoursRedirect() {
  redirect("/settings/details?tab=hours")
}
