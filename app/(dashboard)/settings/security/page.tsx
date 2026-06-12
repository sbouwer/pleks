/**
 * app/(dashboard)/settings/security/page.tsx — Security (Account) category page
 *
 * Route:  /settings/security  (tabs: ?tab=password|mfa|sessions)
 * Auth:   gatewaySSR() — logged-in org member
 * Data:   auth.mfa.listFactors() for TOTP count (MFA tab); PasskeyManager + SessionsView self-fetch
 * Notes:  Universal DetailPageLayout + DetailTabs (CategoryTabs). MFA folds the authenticator status +
 *         PasskeyManager; Sessions is SessionsView (self-only, with "revoke all other sessions").
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { AuthenticatorManager } from "@/components/auth/AuthenticatorManager"
import { PasskeyManager } from "@/components/auth/PasskeyManager"
import { SessionsView } from "@/components/auth/SessionsView"
import { PasswordForm } from "./PasswordForm"
import { SECURITY_TABS } from "./tabs"

export const metadata = { title: "Security" }

export default async function SecurityPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { tab } = await searchParams
  const active = SECURITY_TABS.some((t) => t.id === tab) ? tab! : "password"

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Security"
      sub="Your password, multi-factor methods and active sessions."
      facts={[]}
      tabs={<CategoryTabs tabs={SECURITY_TABS} current={active} />}
    >
      {active === "password" && (
        <>
          <DetailCard title="Password"><PasswordForm /></DetailCard>
          <DetailCard title="Two-factor authentication">
            <div className="space-y-6">
              <AuthenticatorManager />
              <PasskeyManager />
            </div>
          </DetailCard>
        </>
      )}
      {active === "sessions" && (
        <DetailFullWidth>
          <DetailCard title="Active sessions"><SessionsView userId={gw.userId} selfOnly embedded /></DetailCard>
        </DetailFullWidth>
      )}
    </DetailPageLayout>
  )
}
