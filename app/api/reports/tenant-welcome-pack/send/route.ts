/**
 * app/api/reports/tenant-welcome-pack/send/route.ts — sends tenant welcome pack via email
 *
 * Route:  POST /api/reports/tenant-welcome-pack/send
 * Auth:   Supabase user session + user_orgs membership check
 * Data:   builds welcome pack from leaseId/tenantId, renders HTML, sends via sendEmail
 */
import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildTenantWelcomePackData } from "@/lib/reports/tenantWelcomePack"
import { buildTenantWelcomePackHTML } from "@/lib/reports/tenantWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { sendEmail } from "@/lib/comms/send-email"
import { formatZAR, type OrgType } from "@/lib/constants"
import { getOrgCapabilities } from "@/lib/org/capabilities"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as { leaseId?: string; tenantId?: string }
  const leaseId  = body.leaseId  ?? ""
  const tenantId = body.tenantId ?? ""

  if (!leaseId || !tenantId) {
    return Response.json({ error: "Missing leaseId or tenantId" }, { status: 400 })
  }

  // Get org_id from lease
  const service = await createServiceClient()
  const { data: leaseRow } = await service
    .from("leases")
    .select("org_id")
    .eq("id", leaseId)
    .maybeSingle()

  const orgId = (leaseRow as { org_id: string } | null)?.org_id
  if (!orgId) return Response.json({ error: "Lease not found" }, { status: 404 })

  // Verify membership
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  const [data, orgInfo, orgRow] = await Promise.all([
    buildTenantWelcomePackData(orgId, leaseId, tenantId),
    getReportBranding(orgId),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])

  const capabilities = getOrgCapabilities(
    ((orgRow.data as { type: string } | null)?.type as OrgType) ?? "agency",
    ((orgRow.data as { name: string } | null)?.name as string) ?? "",
  )

  if (!data.tenantEmail) {
    return Response.json({ error: "Tenant has no email address on file" }, { status: 422 })
  }

  // Generate HTML without toolbar for the email
  const rawHtml = buildTenantWelcomePackHTML(data, orgInfo, undefined, capabilities.copy.signatureAttribution)

  const unitSuffix = data.unitNumber ? " Unit " + data.unitNumber : ""
  const result = await sendEmail({
    orgId,
    templateKey: "reports.tenant_welcome_pack",
    to: { email: data.tenantEmail, name: data.tenantName },
    subject: `Welcome to ${data.propertyName} — Your Tenant Guide`,
    rawHtml,
    bodyPreview: `Welcome to ${data.propertyName}${unitSuffix}. Monthly rent: ${formatZAR(data.rentAmountCents)}. Payment ref: ${data.paymentReference}.`,
    entityType: "tenant",
    entityId: tenantId,
    triggeredBy: user.id,
  })

  if (!result.success) {
    return Response.json({ error: result.error ?? "Failed to send email" }, { status: 500 })
  }

  return Response.json({ success: true })
}
