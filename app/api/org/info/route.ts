/**
 * app/api/org/info/route.ts — org identity + clause/template flags for the lease editor
 *
 * Route:  GET /api/org/info
 * Auth:   gateway() (agent session + org membership)
 * Data:   organisations, org-scoped via the gateway orgId
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("id, name, clause_edit_confirmed_at, custom_template_active")
    .eq("id", orgId)
    .single()
  logQueryError("GET organisations", orgError)

  return NextResponse.json({
    orgId: org?.id ?? orgId,
    orgName: org?.name ?? "",
    clauseEditConfirmedAt: org?.clause_edit_confirmed_at ?? null,
    customTemplateActive: org?.custom_template_active ?? false,
  })
}
