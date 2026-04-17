import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import { BackLink } from "@/components/ui/BackLink"
import { InsuranceEditForm } from "./InsuranceEditForm"

export default async function InsuranceEditPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>
}>) {
  const { id: propertyId } = await params
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createServiceClient()
  const orgId = membership.org_id

  const [
    { data: property },
    { data: brokerRow },
    { data: brokerContacts },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, insurance_policy_number, insurance_provider, insurance_policy_type, insurance_renewal_date, insurance_replacement_value_cents, insurance_excess_cents, insurance_notes")
      .eq("id", propertyId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("property_brokers")
      .select("broker_contact_id, auto_notify_critical, after_hours_number, notes")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_name")
      .eq("org_id", orgId)
      .eq("primary_role", "insurance_broker")
      .is("deleted_at", null)
      .order("first_name"),
  ])

  if (!property) notFound()

  const p = property as Record<string, unknown>
  const b = brokerRow as Record<string, unknown> | null

  const replacementCents = p.insurance_replacement_value_cents as number | null
  const excessCents = p.insurance_excess_cents as number | null

  return (
    <div className="max-w-xl">
      <BackLink href={`/properties/${propertyId}?tab=insurance`} label="Insurance" />
      <h1 className="font-heading text-2xl font-bold mb-6">Insurance &amp; broker</h1>

      <InsuranceEditForm
        propertyId={propertyId}
        policy={{
          policyNumber:      (p.insurance_policy_number as string | null) ?? null,
          provider:          (p.insurance_provider as string | null) ?? null,
          policyType:        (p.insurance_policy_type as string | null) ?? null,
          renewalDate:       (p.insurance_renewal_date as string | null) ?? null,
          replacementValueR: replacementCents ? (replacementCents / 100).toFixed(0) : null,
          excessR:           excessCents ? (excessCents / 100).toFixed(0) : null,
          notes:             (p.insurance_notes as string | null) ?? null,
        }}
        broker={{
          brokerContactId:    (b?.broker_contact_id as string | null) ?? null,
          autoNotifyCritical: (b?.auto_notify_critical as boolean) ?? true,
          afterHoursNumber:   (b?.after_hours_number as string | null) ?? null,
          brokerNotes:        (b?.notes as string | null) ?? null,
        }}
        brokerContacts={(brokerContacts ?? []) as Array<{
          id: string; first_name: string | null; last_name: string | null; company_name: string | null
        }>}
      />
    </div>
  )
}
