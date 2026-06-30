/**
 * app/account/security/page.tsx — account security (passkeys · MFA · sessions) for ANY authenticated user.
 *
 * Route:  /account/security
 * Auth:   getServerUser — any signed-in user, NOT lease/portal-gated. This is the point: a PRE-LEASE applicant who
 *         created a Pleks account at apply-completion (14R) can manage/REVOKE their passkey here, even before they
 *         have an active lease (the per-portal pages require a portal session). Agents use /settings/security.
 * Data:   resolveUserMembership → portalClass drives PortalSecurityView's role (TOTP-enrol href + back-nav). A
 *         lease-less applicant resolves to (or defaults to) "tenant" — PasskeyManager + SessionsView are self-scoped.
 * Notes:  14R §9a E1 — the single auth-gated surface the tenant/landlord/supplier /account/security copies redirect to.
 */
import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/auth/server"
import { resolveUserMembership } from "@/lib/auth/membership"
import { createClient } from "@/lib/supabase/server"
import { PortalSecurityView } from "@/components/auth/PortalSecurityView"

export const metadata = { title: "Account security" }

export default async function AccountSecurityPage() {
  const user = await getServerUser()
  if (!user) redirect("/login")

  const membership = await resolveUserMembership(user.id).catch(() => null)
  if (membership?.portalClass === "agent") redirect("/settings/security") // agents have the dashboard security page

  const role = membership?.portalClass === "landlord" || membership?.portalClass === "supplier"
    ? membership.portalClass
    : "tenant"

  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totpCount = factors?.totp?.length ?? 0

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-[var(--ink)]">Account security</h1>
      <PortalSecurityView userId={user.id} totpCount={totpCount} role={role} />
    </main>
  )
}
