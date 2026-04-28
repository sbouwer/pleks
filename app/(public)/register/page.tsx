/**
 * app/(public)/register/page.tsx — Redirect stub for old /register links
 *
 * Route:  /register → 307 to /onboarding
 */
import { redirect } from "next/navigation"

export default function RegisterPage() {
  redirect("/onboarding")
}
