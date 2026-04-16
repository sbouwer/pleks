import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildTenantWelcomePackData } from "@/lib/reports/tenantWelcomePack"
import { buildTenantWelcomePackHTML, type TenantWelcomePackToolbar } from "@/lib/reports/tenantWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"


// ── Shared auth check ─────────────────────────────────────────────────────────

async function verifyAccess(userId: string, orgId: string) {
  const supabase = await createClient()
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  return membership ? { ok: true } : { error: "Forbidden" }
}

// ── Fetch org_id for a lease (bypasses RLS via service client) ────────────────

async function getLeaseOrgId(leaseId: string): Promise<string | null> {
  const service = await createServiceClient()
  const { data } = await service
    .from("leases")
    .select("org_id")
    .eq("id", leaseId)
    .maybeSingle()
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

  const [data, orgInfo] = await Promise.all([
    buildTenantWelcomePackData(orgId, leaseId, tenantId),
    getReportBranding(orgId),
  ])

  const toolbar: TenantWelcomePackToolbar = {
    leaseId,
    tenantId,
    tenantName: data.tenantName,
    tenantEmail: data.tenantEmail,
  }

  const html = buildTenantWelcomePackHTML(data, orgInfo, toolbar)

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
