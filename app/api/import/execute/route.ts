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
import { toColumnMapping, toImportDecisions, EXPIRED_ACTION_WIRE, type WizardDecisions } from "@/lib/import/decisions"
import type { ImportDecisions } from "@/lib/import/importRunner"

type Service = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]

/** Create the import session, or reuse the caller's own. Returns null when a supplied sessionId belongs to
 *  another org (the caller-ID census org-scope guard). */
async function resolveSession(
  service: Service,
  args: {
    sessionId: string | undefined
    rows: Record<string, string>[]
    decisions: WizardDecisions | undefined
    runnerDecisions: ImportDecisions
    orgId: string
    userId: string
  },
): Promise<string | null | undefined> {
  const { sessionId, rows, decisions, runnerDecisions, orgId, userId } = args

  if (sessionId) {
    const { data: owned, error: ownedError } = await service
      .from("import_sessions").select("id").eq("id", sessionId).eq("org_id", orgId).maybeSingle()
    logQueryError("POST import_sessions ownership", ownedError)
    if (!owned) return null

    await service.from("import_sessions").update({ status: "importing" }).eq("id", sessionId).eq("org_id", orgId)
    return sessionId
  }

  const { data: session, error: sessionError } = await service
    .from("import_sessions")
    .insert({
      org_id: orgId,
      created_by: userId,
      status: "importing",
      source_row_count: rows.length,
      column_mapping: decisions?.columnMapping ?? null,
      extra_column_routing: decisions?.extraColumnRouting ?? null,
      // Persist what the runner ACTUALLY ACTED ON, never the raw wire. Two reasons:
      //  - `conflictResolutions` used to be read here — a key the wizard has never sent, so the column was
      //    always NULL.
      //  - `expired_lease_action` carries CHECK (IN ('skip','import_as_expired')). The translator tolerates a
      //    junk value (falling back to the safe option), but the raw value would VIOLATE the CHECK — the insert
      //    fails, the session id comes back undefined, and the import then runs with no session row at all:
      //    nothing for the agent or an auditor to trace. Sanitised in, sanitised out.
      conflict_resolutions: runnerDecisions.conflicts.length > 0 ? runnerDecisions.conflicts : null,
      expired_lease_action: EXPIRED_ACTION_WIRE[runnerDecisions.expiredLeases],
      per_row_overrides: decisions?.perRowOverrides ?? null,
    })
    .select("id").single()
  logQueryError("POST import_sessions", sessionError)

  return session?.id as string | undefined
}

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

  // TYPE THE WIRE. `await req.json()` is `any`, which is how the wizard and the runner drifted into two
  // different `ImportDecisions` shapes that share only `columnMapping` — so "skip expired leases" (the
  // wizard's default, printed on the confirm screen) silently did nothing for the life of the feature.
  // The translation is explicit and tested; see lib/import/decisions.ts.
  const body = (await req.json()) as {
    sessionId?: string
    rows?: Record<string, string>[]
    decisions?: WizardDecisions
  }
  const { sessionId, rows, decisions } = body

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 })
  }

  const columnMapping = toColumnMapping(decisions?.columnMapping)
  const runnerDecisions = toImportDecisions(decisions)

  // Create or reuse the import session. `null` = the caller supplied a session id that is not theirs.
  const importSessionId = await resolveSession(service, {
    sessionId, rows, decisions, runnerDecisions, orgId, userId,
  })
  if (importSessionId === null) {
    return NextResponse.json({ error: "Import session not found" }, { status: 404 })
  }

  // Run import
  try {
    const { runImport } = await import("@/lib/import/importRunner")
    const result = await runImport(
      rows,
      columnMapping,
      runnerDecisions,
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
