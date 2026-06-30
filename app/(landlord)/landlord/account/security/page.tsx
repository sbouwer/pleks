/**
 * app/(landlord)/landlord/account/security/page.tsx — redirect to the consolidated /account/security (14R §9a E1).
 *
 * Route:  /landlord/account/security
 * Auth:   none here — the canonical /account/security self-gates (getServerUser) and resolves the role.
 * Notes:  account security (passkeys · MFA · sessions) is account-level, not portal-level, so it lives at ONE
 *         auth-gated surface (the three per-portal copies had inconsistent gates). Kept as a redirect for
 *         back-compat / existing nav links.
 */
import { redirect } from "next/navigation"

export default function LandlordSecurityPage() {
  redirect("/account/security")
}
