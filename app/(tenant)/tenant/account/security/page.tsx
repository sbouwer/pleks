/**
 * app/(tenant)/tenant/account/security/page.tsx — redirect to the consolidated /account/security (14R §9a E1).
 *
 * Route:  /tenant/account/security
 * Auth:   none here — the canonical /account/security self-gates (getServerUser) and resolves the role.
 * Notes:  account security (passkeys · MFA · sessions) is account-level, not lease-level — so a PRE-LEASE applicant
 *         can reach it too (the old page required an active lease via getTenantSession). One auth-gated surface
 *         replaces the three per-portal copies. Kept as a redirect for back-compat / existing nav links.
 */
import { redirect } from "next/navigation"

export default function TenantSecurityPage() {
  redirect("/account/security")
}
