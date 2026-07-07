/**
 * app/(dashboard)/managing-schemes/page.tsx — Redirects legacy /managing-schemes to the suppliers managing-scheme view
 *
 * Route:  /managing-schemes
 * Notes:  redirect-only → /suppliers?type=managing_scheme
 */
import { redirect } from "next/navigation"

export default function ManagingSchemesPage() {
  redirect("/suppliers?type=managing_scheme")
}
