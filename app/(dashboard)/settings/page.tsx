/**
 * app/(dashboard)/settings/page.tsx — settings overview landing
 *
 * Route:  /settings
 * Auth:   dashboard layout (gatewaySSR)
 * Data:   getSettingsOverview (subscriptions/branding/team) → the smart Set up / Needs action groups
 * Notes:  Desktop renders the smart Overview (header + settings search + Set up / Needs action /
 *         Frequently used). Replaces the prior desktop redirect to /settings/details — the generated
 *         SettingsSidebar still provides per-page nav. Mobile keeps the existing drill-down list.
 */
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader"
import { SettingsSearch } from "@/components/settings/SettingsSearch"
import { SettingsOverviewGroups } from "@/components/settings/SettingsOverviewGroups"
import { MobileSettingsNav } from "@/components/mobile/MobileSettingsNav"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getSettingsOverview } from "@/lib/settings/overview"

export default async function SettingsPage() {
  const gw = await gatewaySSR()
  const overview = gw ? await getSettingsOverview(gw.db, gw.orgId) : { setup: [], action: [] }

  return (
    <>
      {/* Desktop: the smart settings Overview. Mobile: existing drill-down list. */}
      <div className="hidden lg:block">
        <SettingsPageHeader
          eyebrow="Account"
          title="Settings"
          sub="Your account, workspace and plan — everything that shapes how Pleks runs for you."
        />
        <SettingsSearch />
        <SettingsOverviewGroups setup={overview.setup} action={overview.action} />
      </div>
      <div className="lg:hidden">
        <MobileSettingsNav />
      </div>
    </>
  )
}
