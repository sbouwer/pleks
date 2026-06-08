/**
 * app/(dashboard)/settings/compliance/page.tsx — Compliance (Workspace) category page
 *
 * Route:  /settings/compliance
 * Auth:   Dashboard layout gateway; org-type guard redirects landlord orgs to /settings/details
 * Data:   getCurrentOrgCapabilities() for org-type check; ComplianceSettingsClient loads the posture
 * Notes:  Unified header — DetailPageLayout (no tabs), matching the Account category pages.
 */
import { redirect } from "next/navigation"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { ComplianceSettingsClient } from "./ComplianceSettingsClient"

export default async function ComplianceSettingsPage() {
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasCompliance) redirect("/settings/details")

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Compliance"
      sub="Your PPRA, POPIA and FICA posture, and the people accountable for it."
      facts={[]}
    >
      <DetailFullWidth>
        <ComplianceSettingsClient />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
