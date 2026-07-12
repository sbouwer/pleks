/**
 * app/api/import/gl-execute/route.ts — execute a GL (opening-balance) import from a prepared session
 *
 * Route:  POST /api/import/gl-execute
 * Auth:   requireAgentWriteAccess("bulk_import") + admin — GL import creates net-new trust postings, so it is
 *         lockdown-gated (a paused/cancelled org cannot import) AND admin-only, matching /api/import. The
 *         client-supplied leaseMatches/propertyMatches UUIDs are org-validated inside glImportRunner (F-2).
 * Data:   import_sessions + GL opening-balance rows via the service client (RLS-bypassing → org filter is the boundary).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

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
  const { blocks, leaseMatches, propertyMatches, dateFilter, importDeposits } = body

  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: "No GL data to import" }, { status: 400 })
  }

  // Create import session
  const { data: session, error: sessionError } = await service
    .from("import_sessions")
    .insert({
      org_id: orgId,
      created_by: userId,
      status: "importing",
      import_type: "gl_history",
      source_row_count: blocks.reduce((sum: number, b: { arTransactions: unknown[] }) => sum + (b.arTransactions?.length ?? 0), 0),
    })
    .select("id")
    .single()
    logQueryError("POST import_sessions", sessionError)

  try {
    const { runGLImport } = await import("@/lib/import/glImportRunner")

    // Reconstruct Date objects from serialised blocks
    const parsedBlocks = blocks.map((b: Record<string, unknown>) => {
      const arTxns = (b.arTransactions as Record<string, unknown>[]) ?? []
      const depTxns = (b.depositTransactions as Record<string, unknown>[]) ?? []
      return {
        propertyName: (b.propertyName as string) ?? "",
        ownerName: (b.ownerName as string) ?? "",
        periodFrom: new Date((b.periodFrom as string) ?? "2020-01-01"),
        periodTo: new Date((b.periodTo as string) ?? "2099-12-31"),
        closingBalance: (b.closingBalance as number) ?? 0,
        unitRefs: (b.unitRefs as string[]) ?? [],
        arTransactions: arTxns.map((t) => ({
          date: new Date((t.date as string) ?? ""),
          type: ((t.type as string) ?? "payment") as "invoice" | "payment",
          amountCents: (t.amountCents as number) ?? 0,
          description: (t.description as string) ?? "",
          unitRef: (t.unitRef as string | null) ?? null,
          period: (t.period as string | null) ?? null,
          rawDescription: (t.rawDescription as string) ?? "",
        })),
        depositTransactions: depTxns.map((t) => ({
          date: new Date((t.date as string) ?? ""),
          type: ((t.type as string) ?? "deposit_received") as "deposit_received" | "deposit_interest" | "deposit_topup",
          debitCents: (t.debitCents as number) ?? 0,
          creditCents: (t.creditCents as number) ?? 0,
          rawDescription: (t.rawDescription as string) ?? "",
        })),
      }
    })

    const result = await runGLImport(
      parsedBlocks,
      leaseMatches ?? {},
      propertyMatches ?? {},
      {
        orgId: orgId,
        agentId: userId,
        importDeposits: importDeposits ?? true,
        dateFilter: dateFilter ?? { from: "2020-01-01", to: "2099-12-31" },
      },
      service
    )

    await service
      .from("import_sessions")
      .update({
        status: result.errors.length > 0 ? "partial" : "complete",
        rows_imported: result.transactionsCreated + result.depositsCreated,
        rows_skipped: result.skipped,
        rows_errored: result.errors.length,
        error_report: result.errors.length > 0 ? result.errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", session?.id)
      .eq("org_id", orgId) // org-scope guard (caller-ID census)

    // Audit log
    await recordAudit(service, { orgId: orgId, table: "import_sessions", recordId: session?.id, action: "INSERT", actorId: userId, after: {
        action: "gl_history_import",
        transactions: result.transactionsCreated,
        deposits: result.depositsCreated,
        skipped: result.skipped,
      } })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    if (session?.id) {
      await service
        .from("import_sessions")
        .update({ status: "failed", error_report: [{ error: String(err) }] })
        .eq("id", session.id)
        .eq("org_id", orgId)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GL import failed" },
      { status: 500 }
    )
  }
}
