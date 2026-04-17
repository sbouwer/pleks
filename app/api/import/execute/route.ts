import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json()
  const { sessionId, rows, decisions } = body

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 })
  }

  const orgId = membership.org_id

  // Create or update import session
  let importSessionId = sessionId
  if (!importSessionId) {
    const { data: session } = await service
      .from("import_sessions")
      .insert({
        org_id: orgId,
        created_by: user.id,
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

    importSessionId = session?.id
  } else {
    await service
      .from("import_sessions")
      .update({ status: "importing" })
      .eq("id", importSessionId)
  }

  // Run import
  try {
    const { runImport } = await import("@/lib/import/importRunner")
    const result = await runImport(
      rows,
      decisions?.columnMapping ?? {},
      decisions ?? {},
      orgId,
      user.id,
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

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    )
  }
}
