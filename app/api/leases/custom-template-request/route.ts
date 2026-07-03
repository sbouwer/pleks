/**
 * app/api/leases/custom-template-request/route.ts — submit a request for a custom lease template
 *
 * Route:  POST /api/leases/custom-template-request
 * Auth:   gateway() (agent session + org membership)
 * Data:   custom_lease_requests (org-scoped by gw.orgId)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — the org requesting its own
 *         template setup, "your data, always" (no subscription lockdown).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

export async function POST(req: NextRequest) {
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const { templatePath, notes } = (await req.json()) as {
    templatePath?: string
    notes?: string
  }

  if (!templatePath) {
    return NextResponse.json(
      { error: "templatePath is required" },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  const { error: insertError } = await db
    .from("custom_lease_requests")
    .insert({
      org_id: orgId,
      submitted_by: userId,
      template_path: templatePath,
      notes: notes ?? null,
      status: "pending",
      compliance_confirmed_at: now,
      compliance_confirmed_by: userId,
    })

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
