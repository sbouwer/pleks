/**
 * app/api/reports/tenant-welcome-pack/send/route.ts — email a tenant their welcome pack
 *
 * Route:  POST /api/reports/tenant-welcome-pack/send
 * Auth:   gateway() (agent session + org membership)
 * Data:   verifies the lease belongs to the caller's org, builds the pack from leaseId/tenantId, renders
 *         HTML, sends via sendEmail. All org-scoped via gateway orgId.
 * Notes:  gateway(), intentionally NOT requireAgentWriteAccess — the send is a comm about the org's own
 *         existing data ("your data, always"), not net-new value creation. leaseId is caller-supplied →
 *         org-scoped (a cross-org leaseId resolves to "Lease not found").
 */
import { NextRequest } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { buildTenantWelcomePackData } from "@/lib/reports/tenantWelcomePack"
import { buildTenantWelcomePackHTML } from "@/lib/reports/tenantWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { sendEmail } from "@/lib/comms/send-email"
import { formatZAR, type OrgType } from "@/lib/constants"
import { getOrgCapabilities } from "@/lib/org/capabilities"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const body = await req.json() as { leaseId?: string; tenantId?: string }
  const leaseId  = body.leaseId  ?? ""
  const tenantId = body.tenantId ?? ""

  if (!leaseId || !tenantId) {
    return Response.json({ error: "Missing leaseId or tenantId" }, { status: 400 })
  }

  // Verify the lease belongs to the caller's org (leaseId is caller-supplied)
  const { data: leaseRow, error: leaseRowError } = await db
    .from("leases")
    .select("id")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .maybeSingle()
  logQueryError("POST leases", leaseRowError)
  if (!leaseRow) return Response.json({ error: "Lease not found" }, { status: 404 })

  const [data, orgInfo, orgRow] = await Promise.all([
    buildTenantWelcomePackData(orgId, leaseId, tenantId),
    getReportBranding(orgId),
    db.from("organisations").select("type, name").eq("id", orgId).single(),
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
    triggeredBy: userId,
  })

  if (!result.success) {
    return Response.json({ error: result.error ?? "Failed to send email" }, { status: 500 })
  }

  return Response.json({ success: true })
}
