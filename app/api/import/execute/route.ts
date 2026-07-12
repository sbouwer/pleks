/**
 * app/api/import/execute/route.ts — execute a data import into the caller's org
 *
 * Route:  POST /api/import/execute
 * Auth:   requireAgentWriteAccess("bulk_import") + admin — the wizard creates net-new business objects
 *         (tenants/units/leases/etc.), so it is lockdown-gated (a paused/cancelled org cannot import) AND
 *         admin-only, matching /api/import.
 * Data:   creates/updates import_sessions; runImport() creates tenants/units/leases/contractors/etc.
 * Notes:  existing sessions are org-scope-verified before reuse; failures mark the session 'failed'
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  let gw
  try {
    gw = await requireAgentWriteAccess("bulk_import")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Bulk import is an admin-only, net-new-business surface — matches the legacy /api/import gate exactly.
  if (!gw.isAdmin) {
    return NextResponse.json({ error: "Admin access required to import data" }, { status: 403 })
  }
  const { db: service, orgId, userId } = gw

  const body = await req.json()
  const { sessionId, rows, decisions } = body

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 })
  }

  // Create or update import session
  let importSessionId = sessionId
  if (!importSessionId) {
    const { data: session, error: sessionError } = await service
      .from("import_sessions")
      .insert({
        org_id: orgId,
        created_by: userId,
        status: "importing",
        source_row_count: rows.length,
        column_mapping: decisions?.columnMapping ?? null,
        extra_column_routing: decisions?.extraColumnRouting ?? null,
        conflict_resolutions: decisions?.conflictResolutions ?? null,
        expired_lease_action: decisions?.expiredLeaseAction ?? null,
        per_row_overrides: decisions?.perRowOverrides ?? null,
      })
      .select("id")
      .single()
    logQueryError("POST import_sessions", sessionError)

    importSessionId = session?.id
  } else {
    // org-scope guard (caller-ID census): validate the session belongs to the org before touching it
    const { data: ownedSession, error: ownedError } = await service
      .from("import_sessions")
      .select("id")
      .eq("id", importSessionId)
      .eq("org_id", orgId)
      .maybeSingle()
    logQueryError("POST import_sessions ownership", ownedError)
    if (!ownedSession) return NextResponse.json({ error: "Import session not found" }, { status: 404 })

    await service
      .from("import_sessions")
      .update({ status: "importing" })
      .eq("id", importSessionId)
      .eq("org_id", orgId)
  }

  // Run import
  try {
    const { runImport } = await import("@/lib/import/importRunner")
    const result = await runImport(
      rows,
      decisions?.columnMapping ?? {},
      decisions ?? {},
      orgId,
      userId,
      importSessionId,
      service
    )

    const totalCreated = result.tenantsCreated + result.unitsCreated + result.leasesCreated

    // Update session with results
    await service
      .from("import_sessions")
      .update({
        status: result.errors.length > 0 ? "partial" : "complete",
        rows_imported: totalCreated,
        rows_skipped: result.skipped,
        rows_errored: result.errors.length,
        error_report: result.errors.length > 0 ? result.errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importSessionId)
      .eq("org_id", orgId)

    return NextResponse.json({
      ok: true,
      sessionId: importSessionId,
      created: {
        tenants: result.tenantsCreated,
        units: result.unitsCreated,
        leases: result.leasesCreated,
        contractors: result.contractorsCreated ?? 0,
        landlords: result.landlordsImported ?? 0,
        agentInvites: result.agentInvitesSent ?? 0,
        bankAccounts: result.bankAccountsImported ?? 0,
      },
      skipped: result.skipped,
      errors: result.errors,
      pendingLandlordLinks: result.pendingLandlordLinks ?? [],
      agentInvites: result.agentInvites ?? [],
    })
  } catch (err) {
    await service
      .from("import_sessions")
      .update({ status: "failed", error_report: [{ error: String(err) }] })
      .eq("id", importSessionId)
      .eq("org_id", orgId)

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    )
  }
}
