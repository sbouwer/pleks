import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BackLink } from "@/components/ui/BackLink"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ statementId: string }>
}) {
  const { statementId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: stmt } = await supabase
    .from("owner_statements")
    .select("*, properties(name, address_line1, city, owner_name, owner_email)")
    .eq("id", statementId)
    .single()

  if (!stmt) notFound()

  const property = stmt.properties as unknown as { name: string; address_line1: string; city: string; owner_name: string; owner_email: string } | null
  const periodDate = new Date(stmt.period_month)
  const periodLabel = periodDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
  const incomeLines = (stmt.income_lines as { unit: string; tenant: string; invoice_ref: string; amount_cents: number; amount_paid_cents: number; status: string }[]) || []
  const expenseLines = (stmt.expense_lines as { description: string; contractor: string; invoice_ref: string; amount_cents: number }[]) || []
  const arrearsLines = (stmt.arrears_lines as { unit: string; tenant: string; overdue_amount_cents: number }[]) || []

  let stmtBadgeStatus: "active" | "completed" | "draft"
  if (stmt.status === "sent") { stmtBadgeStatus = "active" }
  else if (stmt.status === "viewed") { stmtBadgeStatus = "completed" }
  else { stmtBadgeStatus = "draft" }

  return (
    <div>
      <BackLink href="/statements" label="Statements" />
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-3xl">{property?.name} — {periodLabel}</h1>
          <StatusBadge status={stmtBadgeStatus} />
        </div>
        <p className="text-muted-foreground">
          {property?.owner_name && `Prepared for: ${property.owner_name}`}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Income</p><p className="font-heading text-xl">{formatZAR(stmt.gross_income_cents)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Expenses</p><p className="font-heading text-xl">{formatZAR(stmt.total_expenses_cents)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Mgmt Fee</p><p className="font-heading text-xl">{formatZAR(stmt.management_fee_cents + stmt.management_fee_vat_cents)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Net to Owner</p><p className="font-heading text-xl text-brand">{formatZAR(stmt.net_to_owner_cents)}</p></CardContent></Card>
      </div>

      {/* Income */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-lg">Rental Income</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {incomeLines.map((line, i) => {
              let lineBadgeStatus: "paid" | "pending" | "overdue"
              if (line.status === "paid") { lineBadgeStatus = "paid" }
              else if (line.status === "partial") { lineBadgeStatus = "pending" }
              else { lineBadgeStatus = "overdue" }
              return (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                <div>
                  <span className="font-medium">{line.unit}</span>
                  <span className="text-muted-foreground ml-2">{line.tenant}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{formatZAR(line.amount_paid_cents)}</span>
                  <StatusBadge status={lineBadgeStatus} />
                </div>
              </div>
              )
            })}
            <div className="flex justify-between font-medium pt-2">
              <span>Total Income</span>
              <span>{formatZAR(stmt.gross_income_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      {expenseLines.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Expenses</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expenseLines.map((line, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                  <div>
                    <span>{line.description}</span>
                    <span className="text-muted-foreground ml-2">({line.contractor})</span>
                  </div>
                  <span>{formatZAR(line.amount_cents)}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2">
                <span>Total Expenses</span>
                <span>{formatZAR(stmt.total_expenses_cents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Arrears */}
      {arrearsLines.length > 0 && (
        <Card className="mb-4 border-warning/30">
          <CardHeader><CardTitle className="text-lg">Arrears</CardTitle></CardHeader>
          <CardContent>
            {arrearsLines.map((line, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{line.tenant}</span>
                <span className="text-muted-foreground"> ({line.unit})</span>
                <span className="text-danger ml-2">{formatZAR(line.overdue_amount_cents)} outstanding</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agent notes */}
      {stmt.agent_notes && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{stmt.agent_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
