"use server"

import * as React from "react"
import { gateway } from "@/lib/supabase/gateway"
import { sendEmail, buildBranding, fetchOrgSettings, type SendEmailResult } from "@/lib/comms/send-email"
import { EmailLayout, EmailButton, EmailDetail, EmailSectionHeading } from "@/lib/comms/templates/layout"
import { formatZAR } from "@/lib/constants"
import { inviteLandlord } from "@/lib/portal/inviteLandlord"

export async function inviteLandlordPortal(landlordId: string): Promise<{ success?: boolean; error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  return inviteLandlord(landlordId, gw.userId)
}

export async function emailLeaseToTenant(leaseId: string): Promise<SendEmailResult & { error?: string }> {
  const gw = await gateway()
  if (!gw) return { success: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select(`
      id, status, start_date, end_date, rent_amount_cents,
      tenant_view(id, first_name, last_name, company_name, entity_type, email),
      units(unit_number, properties(name, address_line1, city))
    `)
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (leaseError || !lease) return { success: false, error: "Lease not found" }

  const tv = lease.tenant_view as unknown as {
    id: string; first_name: string | null; last_name: string | null
    company_name: string | null; entity_type: string; email: string | null
  } | null

  if (!tv?.email) return { success: false, error: "Tenant has no email address on file" }

  const unit = lease.units as unknown as {
    unit_number: string
    properties: { name: string; address_line1: string | null; city: string | null }
  } | null

  const tenantName = tv.entity_type === "organisation"
    ? (tv.company_name ?? "Tenant")
    : `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim() || "Tenant"

  const propertyAddress = [
    unit?.unit_number,
    unit?.properties?.name ?? unit?.properties?.address_line1,
    unit?.properties?.city,
  ].filter(Boolean).join(", ")

  const startDate = new Date(lease.start_date as string).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })
  const endDate = lease.end_date
    ? new Date(lease.end_date as string).toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "Month-to-month"

  const orgSettings = await fetchOrgSettings(orgId)
  const branding = buildBranding(orgSettings)
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal`

  const emailElement = (
    <EmailLayout
      preview={`Your lease at ${propertyAddress} — lease details inside`}
      branding={branding}
    >
      <EmailSectionHeading>Lease Confirmation</EmailSectionHeading>
      <EmailDetail label="Tenant" value={tenantName} />
      <EmailDetail label="Property" value={propertyAddress} />
      <EmailDetail label="Lease start" value={startDate} />
      <EmailDetail label="Lease end" value={endDate} />
      <EmailDetail label="Monthly rent" value={formatZAR(lease.rent_amount_cents as number)} />
      <EmailButton href={portalUrl} accentColor={branding.accentColor}>
        View your lease in the portal
      </EmailButton>
    </EmailLayout>
  )

  const result = await sendEmail({
    orgId,
    templateKey: "lease.document_emailed",
    to: { email: tv.email, name: tenantName, contactId: tv.id },
    subject: `Your lease — ${propertyAddress}`,
    emailElement,
    bodyPreview: `Your lease at ${propertyAddress}. Term: ${startDate} – ${endDate}. Rent: ${formatZAR(lease.rent_amount_cents as number)}.`,
    entityType: "lease",
    entityId: leaseId,
    triggeredBy: userId,
  })

  return result
}
