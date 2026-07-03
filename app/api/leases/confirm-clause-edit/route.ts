/**
 * app/api/leases/confirm-clause-edit/route.ts — record the org's confirmation of a clause-wording edit
 *
 * Route:  POST /api/leases/confirm-clause-edit
 * Auth:   gateway() (agent session + org membership)
 * Data:   organisations (org-scoped by gw.orgId), audit_log (org-scoped)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — the org's own clause-edit
 *         attestation, "your data, always". orgId comes from the gateway session, never the
 *         request body (removed a caller-supplied-id smell).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

export async function POST(req: NextRequest) {
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  const now = new Date().toISOString()

  const { error: updateError } = await db
    .from("organisations")
    .update({
      clause_edit_confirmed_at: now,
      clause_edit_confirmed_by: userId,
      clause_edit_confirmed_ip: clientIp,
    })
    .eq("id", orgId)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    )
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "UPDATE",
    changed_by: userId,
    new_values: {
      clause_edit_confirmed_at: now,
      clause_edit_confirmed_ip: clientIp,
    },
  })

  return NextResponse.json({ ok: true })
}
