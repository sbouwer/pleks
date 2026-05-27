/**
 * app/(auth)/select-role/page.tsx — deprecated role-selector; redirects to /auth/resolver
 *
 * Route:  /select-role
 * Auth:   public (resolver enforces session)
 * Notes:  Deprecated 2026-05-27 per D-AUTH-RESOLVER-22. I-4 invariant (one email = one
 *         active role = one org) makes multi-workspace selection obsolete. Page preserved
 *         to avoid 404s from bookmarks or cached links.
 */
import { redirect } from "next/navigation"

export const metadata = { title: "Redirecting…" }

export default function SelectRolePage() {
  redirect("/auth/resolver")
}
