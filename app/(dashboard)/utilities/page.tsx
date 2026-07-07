/**
 * app/(dashboard)/utilities/page.tsx — Redirects legacy /utilities to the suppliers utility view
 *
 * Route:  /utilities
 * Notes:  redirect-only → /suppliers?type=utility
 */
import { redirect } from "next/navigation"

export default function UtilitiesPage() {
  redirect("/suppliers?type=utility")
}
