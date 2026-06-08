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
import Link from "next/link"
import { Smartphone } from "lucide-react"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createClient } from "@/lib/supabase/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { PasskeyManager } from "@/components/auth/PasskeyManager"
import { SessionsView } from "@/components/auth/SessionsView"
import { PasswordForm } from "./PasswordForm"
import { SECURITY_TABS } from "./tabs"

export const metadata = { title: "Security" }

function AuthenticatorPanel({ totpCount }: Readonly<{ totpCount: number }>) {
  return (
    <div className="rounded-[var(--r-button)] border border-border">
      <div className="flex items-start gap-4 p-4">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Authenticator app</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {totpCount === 0 && "No authenticator enrolled"}
            {totpCount === 1 && <span className="text-amber-600 dark:text-amber-400">1 device enrolled — add a second for backup</span>}
            {totpCount >= 2 && <span className="text-success">{totpCount} devices enrolled</span>}
          </div>
        </div>
        <Link href="/settings/security/enrol-totp" className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          {totpCount === 0 ? "Set up" : "Add another"}
        </Link>
      </div>
    </div>
  )
}

export default async function SecurityPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { tab } = await searchParams
  const active = SECURITY_TABS.some((t) => t.id === tab) ? tab! : "password"

  let totpCount = 0
  if (active === "mfa") {
    const supabase = await createClient()
    const { data: factors } = await supabase.auth.mfa.listFactors()
    totpCount = factors?.totp?.length ?? 0
  }

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Security"
      sub="Your password, multi-factor methods and active sessions."
      facts={[]}
      tabs={<CategoryTabs tabs={SECURITY_TABS} current={active} />}
    >
      <DetailFullWidth>
        {active === "password" && <PasswordForm />}
        {active === "mfa" && (
          <div className="max-w-2xl space-y-8">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Two-factor authentication</h2>
              <AuthenticatorPanel totpCount={totpCount} />
            </section>
            <PasskeyManager />
          </div>
        )}
        {active === "sessions" && <SessionsView userId={gw.userId} selfOnly />}
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
