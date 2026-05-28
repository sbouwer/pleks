/**
 * app/(onboarding)/welcome/secure/page.tsx — Focused TOTP enrolment in the Welcome flow
 *
 * Route:  /welcome/secure
 * Auth:   authenticated agent (inherits /welcome manifest rule by prefix match — skipOrgCheck, AGENT_ROLES)
 * Notes:  Renders <EnrolTotp> inside the (onboarding) focused shell (no dashboard nav).
 *         redirectTo="/welcome?step=passkey" returns to Welcome for the optional passkey step.
 *         lookupManifestRule("/welcome/secure") resolves to the /welcome entry (startsWith "/welcome/").
 *         No manifest/auth/migration change needed.
 */
import { EnrolTotp } from "@/components/auth/EnrolTotp"

export default function WelcomeSecurePage() {
  return <EnrolTotp mandatory redirectTo="/welcome?step=passkey" variant="welcome" />
}
