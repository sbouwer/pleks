import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { ReconActions } from "./ReconActions"

const MATCH_STATUS_MAP: Record<string, "completed" | "active" | "pending" | "arrears"> = {
  matched_exact: "completed",
  matched_fuzzy: "active",
  matched_ai: "pending",
  matched_manual: "completed",
  unmatched: "arrears",
  ignored: "completed",
  split: "completed",
}

export default async function ReconDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>
}) {
  const { importId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: imp } = await supabase
    .from("bank_statement_imports")
    .select("*")
    .eq("id", importId)
    .single()

  if (!imp) notFound()

  const { data: lines } = await supabase
    .from("bank_statement_lines")
    .select("*")
    .eq("import_id", importId)
    .order("line_sequence")

  const allLines = lines || []
  const matched = allLines.filter((l) => l.match_status.startsWith("matched_"))
  const unmatched = allLines.filter((l) => l.match_status === "unmatched")
  const ignored = allLines.filter((l) => l.match_status === "ignored")

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/payments/reconciliation" className="hover:text-foreground">Reconciliation</Link> &rsaquo; {imp.original_filename}
          </p>
          <h1 className="font-heading text-3xl">{imp.detected_bank?.toUpperCase() || "Bank"} Statement</h1>
          <p className="text-muted-foreground">
            {imp.statement_period_from && `${imp.statement_period_from} → ${imp.statement_period_to}`}
          </p>
        </div>
        <ReconActions importId={importId} reconciled={imp.reconciled} unmatched={unmatched.length} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Transactions</p><p className="font-heading text-2xl">{allLines.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Matched</p><p className="font-heading text-2xl text-success">{matched.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Unmatched</p><p className="font-heading text-2xl text-danger">{unmatched.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Ignored</p><p className="font-heading text-2xl text-muted-foreground">{ignored.length}</p></CardContent></Card>
      </div>

      {/* Balance check */}
      {imp.closing_balance_cents !== null && (
        <Card className={`mb-6 ${imp.balance_discrepancy_cents === 0 ? "border-success/30" : "border-warning/30"}`}>
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground">Bank Closing</p><p className="font-heading text-lg">{formatZAR(imp.closing_balance_cents)}</p></div>
              {imp.pleks_calculated_closing_cents !== null && (
                <div><p className="text-muted-foreground">Pleks Calculated</p><p className="font-heading text-lg">{formatZAR(imp.pleks_calculated_closing_cents)}</p></div>
              )}
              {imp.balance_discrepancy_cents !== null && (
                <div><p className="text-muted-foreground">Discrepancy</p><p className={`font-heading text-lg ${imp.balance_discrepancy_cents === 0 ? "text-success" : "text-danger"}`}>{formatZAR(imp.balance_discrepancy_cents)}</p></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction lines */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Transactions</CardTitle></CardHeader>
        <CardContent>
          {allLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions extracted yet. Extraction runs automatically after upload.</p>
          ) : (
            <div className="space-y-1">
              {allLines.map((line) => {
                let lineClass: string
                if (line.match_status === "unmatched") { lineClass = "bg-danger-bg" }
                else if (line.match_status === "ignored") { lineClass = "opacity-50" }
                else { lineClass = "" }
                return (
                <div
                  key={line.id}
                  className={`flex items-center justify-between py-2 px-2 rounded text-sm ${lineClass}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{line.transaction_date}</span>
                      <span className="truncate">{line.description_clean || line.description_raw}</span>
                    </div>
                    {line.reference_clean && (
                      <span className="text-xs text-muted-foreground ml-22">Ref: {line.reference_clean}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono text-sm ${line.direction === "credit" ? "text-success" : "text-danger"}`}>
                      {line.direction === "credit" ? "+" : "-"}{formatZAR(Math.abs(line.amount_cents))}
                    </span>
                    <StatusBadge status={MATCH_STATUS_MAP[line.match_status] || "pending"} />
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
