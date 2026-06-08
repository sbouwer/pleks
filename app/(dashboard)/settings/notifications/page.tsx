/**
 * app/(dashboard)/settings/notifications/page.tsx — Notifications (Account) category page
 *
 * Route:  /settings/notifications
 * Auth:   gatewaySSR (redirect to /login if no session)
 * Data:   NotificationsForm fetches/saves GET/PATCH /api/org/notifications
 * Notes:  Universal DetailPageLayout (no tabs — email + SMS are one settings object saved together).
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { NotificationsForm } from "./NotificationsForm"

export const metadata = { title: "Notifications" }

export default async function NotificationsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Notifications"
      sub="Which email and SMS notifications are sent to tenants and landlords. Tenants can also manage their own preferences via the unsubscribe link in emails."
      facts={[]}
    >
      <DetailFullWidth>
        <NotificationsForm />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
