/**
 * app/(dashboard)/settings/security/enrol/page.tsx — Factor-choice MFA enrolment (ADDENDUM_70 Slice B)
 *
 * Route:  /settings/security/enrol  (the resolver's mfa_enrol destination — replaces the
 *         hardwired /settings/security/enrol-totp now that a passkey is a co-equal AAL2 primary).
 * Auth:   authenticated, AAL1-reachable (ROUTE_MANIFEST "/settings/security/enrol", skipOrgCheck).
 * Notes:  Thin wrapper around <SecureAccount>; logic lives there. ?redirect = post-enrol target,
 *         ?mandatory = forced (resolver) vs voluntary (Settings).
 */
import { SecureAccount } from "@/components/auth/SecureAccount"

export default async function SecureAccountPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ redirect?: string; mandatory?: string }> }>) {
  const sp = await searchParams
  return <SecureAccount redirectTo={sp.redirect} mandatory={sp.mandatory === "true"} />
}
