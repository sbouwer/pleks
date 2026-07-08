/**
 * app/(tenant)/tenant/account/page.tsx — tenant portal: account (identity + editable contact details)
 *
 * Route:  /tenant/account
 * Auth:   getTenantSession (redirects to /login); contact scoped to the tenant + org
 * Data:   tenants → contacts (+ contact_phones/emails) via the service client
 * Notes:  Canon DetailPageLayout shell; the editable form lives in PortalAccountClient.
 */
import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { decryptIdNumber } from "@/lib/crypto/idNumber"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { PortalAccountClient } from "./PortalAccountClient"

export default async function PortalAccountPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { tenantId, orgId } = session

  const { data: tenant, error } = await service
    .from("tenants")
    .select(`
      id, org_id, contact_id,
      contacts(
        id, first_name, last_name, company_name, entity_type,
        id_number,
        contact_phones(id, number, phone_type, is_primary, can_whatsapp),
        contact_emails(id, email, email_type, is_primary)
      )
    `)
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (error || !tenant) redirect("/tenant")

  const contact = tenant.contacts as unknown as {
    id: string
    first_name: string | null
    last_name: string | null
    company_name: string | null
    entity_type: string
    id_number: string | null
    contact_phones: { id: string; number: string; phone_type: string; is_primary: boolean; can_whatsapp: boolean }[]
    contact_emails: { id: string; email: string; email_type: string; is_primary: boolean }[]
  } | null

  if (!contact) redirect("/tenant")

  return (
    <DetailPageLayout category="Home" backHref="/tenant" title="Account" facts={[]}>
      <DetailFullWidth>
        <PortalAccountClient
          contactId={contact.id}
          orgId={orgId}
          firstName={contact.first_name}
          lastName={contact.last_name}
          companyName={contact.company_name}
          idNumber={decryptIdNumber(contact.id_number)}
          phones={contact.contact_phones ?? []}
          emails={contact.contact_emails ?? []}
        />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
