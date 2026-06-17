/**
 * app/(dashboard)/settings/configuration/page.tsx — legacy route → Organisation › Configuration tab
 *
 * Route:  /settings/configuration (redirects to /settings/details?tab=configuration)
 * Notes:  Configuration folded into the Organisation category page (ConfigurationForm panel). Kept as a
 *         redirect so existing bookmarks/deep-links still resolve to the tab.
 */
import { redirect } from "next/navigation"

export default function ConfigurationRedirect() {
  redirect("/settings/details?tab=configuration")
}
