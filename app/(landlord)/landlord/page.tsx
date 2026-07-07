/**
 * app/(landlord)/landlord/page.tsx — landlord portal index; redirects to the dashboard
 *
 * Route:  /landlord → /landlord/dashboard
 */
import { redirect } from "next/navigation"

export default function LandlordIndexPage() {
  redirect("/landlord/dashboard")
}
