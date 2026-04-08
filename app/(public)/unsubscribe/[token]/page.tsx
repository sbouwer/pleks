/**
 * Unsubscribe / manage email preferences page.
 * Accessed via token link in every email footer.
 * Mandatory templates (legal notices) shown greyed-out — cannot be toggled.
 */

import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { UnsubscribeClient } from "./UnsubscribeClient"

interface Props {
  params: Promise<{ token: string }>
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params
  const service = getServiceClient()

  const { data: prefs } = await service
    .from("communication_preferences")
    .select("*")
    .eq("unsubscribe_token", token)
    .maybeSingle()

  if (!prefs) notFound()

  // Fetch org name for display
  const { data: org } = await service
    .from("organisations")
    .select("name")
    .eq("id", prefs.org_id)
    .single()

  return (
    <UnsubscribeClient
      token={token}
      orgName={org?.name ?? "Pleks"}
      prefs={{
        unsubscribed_at: prefs.unsubscribed_at,
        email_applications: prefs.email_applications,
        email_maintenance: prefs.email_maintenance,
        email_arrears: prefs.email_arrears,
        email_inspections: prefs.email_inspections,
        email_lease: prefs.email_lease,
        email_statements: prefs.email_statements,
        sms_maintenance: prefs.sms_maintenance,
        sms_arrears: prefs.sms_arrears,
        sms_inspections: prefs.sms_inspections,
      }}
    />
  )
}
