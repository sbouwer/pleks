/**
 * app/(dashboard)/settings/compliance/page.tsx — Compliance settings server wrapper; redirects non-compliance orgs
 *
 * Route:  /settings/compliance
 * Auth:   Dashboard layout gateway; org-type guard redirects landlord orgs to /settings/details
 * Data:   getCurrentOrgCapabilities() for org-type check
 */
import { redirect } from "next/navigation"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { ComplianceSettingsClient } from "./ComplianceSettingsClient"

export default async function ComplianceSettingsPage() {
  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasCompliance) redirect("/settings/details")
  return <ComplianceSettingsClient />
}
