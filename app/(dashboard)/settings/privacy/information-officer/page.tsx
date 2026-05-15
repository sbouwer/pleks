/**
 * app/(dashboard)/settings/privacy/information-officer/page.tsx — Org Information Officer details
 *
 * Route:  /settings/privacy/information-officer
 * Auth:   gatewaySSR() — org member; edits require org admin role
 * Data:   organisations.settings.information_officer (JSONB)
 * Notes:  D-POPIA-19: IO published per POPIA s73(2). Details flow into DSR emails and
 *         the public /privacy/information-officer page. Editable by org admin role only.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InformationOfficerForm } from "./InformationOfficerForm"

export const metadata = { title: "Information Officer" }

interface IoDetails {
  name?: string
  email?: string
  postal_address?: string
  phone?: string
}

export default async function InformationOfficerPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { orgId, userId } = gw

  const db = createServiceClient()
  const { data: org, error } = await (await db)
    .from("organisations")
    .select("name, settings, user_orgs!inner(role)")
    .eq("id", orgId)
    .eq("user_orgs.user_id", userId)
    .single()

  if (error || !org) redirect("/settings/details")

  const userRole = Array.isArray(org.user_orgs)
    ? (org.user_orgs[0] as { role: string })?.role
    : (org.user_orgs as { role: string })?.role

  const isAdmin = userRole === "owner" || userRole === "property_manager"
  const io = ((org.settings as Record<string, unknown> | null)?.information_officer ?? {}) as IoDetails

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Information Officer</h1>
        <p className="text-sm text-muted-foreground">
          Your organisation&apos;s designated Information Officer (POPIA s73). These details are
          published on the data subject request emails and the privacy page.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Organisation: {org.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <InformationOfficerForm
            orgId={orgId}
            initialValues={io}
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-3 border rounded-md">
        <p className="font-medium">POPIA s73(2) requirement</p>
        <p>
          The Information Officer&apos;s contact details must be disclosed whenever a data subject
          exercises their rights. An empty IO record means Pleks&apos;s default contact appears on
          rejection emails — update this to show your agency&apos;s own IO.
        </p>
      </div>
    </div>
  )
}
