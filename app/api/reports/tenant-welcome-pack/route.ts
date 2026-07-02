/**
 * app/api/reports/tenant-welcome-pack/route.ts — HTML preview renderer for tenant welcome pack
 *
 * Route:  GET /api/reports/tenant-welcome-pack?leaseId=&tenantId=
 * Auth:   Supabase user session + user_orgs membership check
 * Data:   builds welcome pack from leaseId/tenantId, returns raw HTML for browser preview
 */
import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"
import { buildTenantWelcomePackData } from "@/lib/reports/tenantWelcomePack"
import { buildTenantWelcomePackHTML, type TenantWelcomePackToolbar } from "@/lib/reports/tenantWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { type OrgType } from "@/lib/constants"
import { getOrgCapabilities } from "@/lib/org/capabilities"
import { logQueryError } from "@/lib/supabase/logQueryError"


// ── Shared auth check ─────────────────────────────────────────────────────────

async function verifyAccess(userId: string, orgId: string) {
  // Service client — the membership check on the (lease-derived) orgId is the boundary
  const service = await createServiceClient()
  const membership = await getMembership(service, userId, orgId)
  return membership ? { ok: true } : { error: "Forbidden" }
}

// ── Fetch org_id for a lease (bypasses RLS via service client) ────────────────

async function getLeaseOrgId(leaseId: string): Promise<string | null> {
  const service = await createServiceClient()
  const { data, error: queryError } = await service
    .from("leases")
    .select("org_id")
    .eq("id", leaseId)
    .maybeSingle()
    logQueryError("getLeaseOrgId leases", queryError)
  return (data as { org_id: string } | null)?.org_id ?? null
}

// ── GET — render HTML preview in browser ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const leaseId  = params.get("leaseId")  ?? ""
  const tenantId = params.get("tenantId") ?? ""

  if (!leaseId || !tenantId) {
    return Response.json({ error: "Missing leaseId or tenantId" }, { status: 400 })
  }

  const orgId = await getLeaseOrgId(leaseId)
  if (!orgId) return Response.json({ error: "Lease not found" }, { status: 404 })

  const access = await verifyAccess(user.id, orgId)
  if (access.error) return Response.json({ error: access.error }, { status: 403 })

  const service = await createServiceClient()
  const [data, orgInfo, orgRow] = await Promise.all([
    buildTenantWelcomePackData(orgId, leaseId, tenantId),
    getReportBranding(orgId),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])

  const capabilities = getOrgCapabilities(
    ((orgRow.data as { type: string } | null)?.type as OrgType) ?? "agency",
    ((orgRow.data as { name: string } | null)?.name as string) ?? "",
  )

  const toolbar: TenantWelcomePackToolbar = {
    leaseId,
    tenantId,
    tenantName: data.tenantName,
    tenantEmail: data.tenantEmail,
  }

  const html = buildTenantWelcomePackHTML(data, orgInfo, toolbar, capabilities.copy.signatureAttribution)

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
