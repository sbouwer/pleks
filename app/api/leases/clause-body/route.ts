/**
 * app/api/leases/clause-body/route.ts — save/reset a custom lease-clause body (org or per-lease)
 *
 * Route:  POST + DELETE /api/leases/clause-body
 * Auth:   gateway() (agent session + org membership)
 * Data:   lease_clause_selections (org-scoped), audit_log (org-scoped)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — the org's own clause
 *         wording settings, "your data, always" (no subscription lockdown).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

// Save or reset custom clause body (org-level when leaseId omitted)
export async function POST(req: NextRequest) {
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const { clauseKey, customBody, leaseId } = await req.json()

  if (!clauseKey) {
    return NextResponse.json({ error: "clauseKey required" }, { status: 400 })
  }

  // Upsert custom body
  const { error } = await db
    .from("lease_clause_selections")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- upsert keyed on onConflict (org_id,clause_key,lease_id) with org_id: orgId from gateway() — a foreign lease_id can only INSERT into the caller's own org, never merge another org's row
    .upsert({
      org_id: orgId,
      lease_id: leaseId ?? null,
      clause_key: clauseKey,
      enabled: true,
      custom_body: customBody,
    }, {
      onConflict: "org_id,clause_key,lease_id",
      ignoreDuplicates: false,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "lease_clause_selections",
    record_id: clauseKey,
    action: "UPDATE",
    changed_by: userId,
    new_values: {
      action: "clause_wording_edited",
      clause_key: clauseKey,
      scope: leaseId ? "per_lease" : "org_default",
    },
  })

  return NextResponse.json({ ok: true })
}

// Reset clause to standard (delete custom body)
export async function DELETE(req: NextRequest) {
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { clauseKey, leaseId } = await req.json()

  if (!clauseKey) {
    return NextResponse.json({ error: "clauseKey required" }, { status: 400 })
  }

  let query = db
    .from("lease_clause_selections")
    .delete()
    .eq("org_id", orgId)
    .eq("clause_key", clauseKey)

  if (leaseId) {
    query = query.eq("lease_id", leaseId)
  } else {
    query = query.is("lease_id", null)
  }

  await query

  return NextResponse.json({ ok: true })
}
