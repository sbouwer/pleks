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
  const { blocks, leaseMatches, propertyMatches, dateFilter, importDeposits } = body

  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: "No GL data to import" }, { status: 400 })
  }

  // Create import session
  const { data: session } = await service
    .from("import_sessions")
    .insert({
      org_id: membership.org_id,
      created_by: user.id,
      status: "importing",
      import_type: "gl_history",
      source_row_count: blocks.reduce((sum: number, b: { arTransactions: unknown[] }) => sum + (b.arTransactions?.length ?? 0), 0),
    })
    .select("id")
    .single()

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
        orgId: membership.org_id,
        agentId: user.id,
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

    // Audit log
    await service.from("audit_log").insert({
      org_id: membership.org_id,
      table_name: "import_sessions",
      record_id: session?.id,
      action: "INSERT",
      changed_by: user.id,
      new_values: {
        action: "gl_history_import",
        transactions: result.transactionsCreated,
        deposits: result.depositsCreated,
        skipped: result.skipped,
      },
    })

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
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GL import failed" },
      { status: 500 }
    )
  }
}
