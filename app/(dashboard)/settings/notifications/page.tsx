/**
 * app/(dashboard)/settings/notifications/page.tsx — Notifications (Account) category page
 *
 * Route:  /settings/notifications  (tabs: ?tab=notifications|email)
 * Auth:   gatewaySSR (redirect to /login if no session)
 * Data:   NotificationsForm fetches/saves GET/PATCH /api/org/notifications (per tab, full object)
 * Notes:  Universal DetailPageLayout + DetailTabs. Notifications = which events send; Email setup = sender
 *         identity + sending domain.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { NotificationsForm } from "./NotificationsForm"
import { NOTIFICATION_TABS } from "./tabs"

export const metadata = { title: "Notifications" }

export default async function NotificationsPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { tab } = await searchParams
  const active = NOTIFICATION_TABS.some((t) => t.id === tab) ? tab! : "notifications"

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Notifications"
      sub="Which email and SMS notifications go out — and how your email is sent."
      facts={[]}
      tabs={<CategoryTabs tabs={NOTIFICATION_TABS} current={active} />}
    >
      <DetailFullWidth>
        <NotificationsForm tab={active as "notifications" | "email"} />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
