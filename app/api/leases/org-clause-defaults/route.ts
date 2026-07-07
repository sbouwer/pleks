/**
 * app/api/leases/org-clause-defaults/route.ts — upsert org-level optional clause toggle defaults
 *
 * Route:  POST /api/leases/org-clause-defaults
 * Auth:   gateway() (agent session + org membership)
 * Data:   org_lease_clause_defaults (org-scoped by gw.orgId)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — the org's own clause defaults,
 *         "your data, always" (no subscription lockdown).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

interface UpdateEntry {
  clause_key: string
  enabled: boolean
}

// POST /api/leases/org-clause-defaults
// Body: { updates: Array<{ clause_key, enabled }> }
// Upserts org-level optional clause toggle defaults.
export async function POST(req: NextRequest) {
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await req.json() as { updates: UpdateEntry[] }
  if (!Array.isArray(body.updates)) {
    return NextResponse.json({ error: "updates array required" }, { status: 400 })
  }

  const rows = body.updates.map(({ clause_key, enabled }) => ({
    org_id: orgId,
    clause_key,
    enabled,
  }))

  const { error } = await db
    .from("org_lease_clause_defaults")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- upsert keyed on onConflict (org_id,clause_key) with each row's org_id: orgId from gateway() — cannot merge into another org's row
    .upsert(rows, { onConflict: "org_id,clause_key" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
