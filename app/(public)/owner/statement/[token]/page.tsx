import { createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import Image from "next/image"

export default async function OwnerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: stmt } = await supabase
    .from("owner_statements")
    .select("*, properties(name, address_line1, city, owner_name)")
    .eq("portal_token", token)
    .single()

  if (!stmt) notFound()

  // Check token expiry
  if (stmt.portal_token_expires_at && new Date(stmt.portal_token_expires_at) < new Date()) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-medium mb-2">Link Expired</p>
            <p className="text-sm text-muted-foreground">
              This statement link has expired. Please contact your property manager for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Mark as viewed
  if (!stmt.viewed_at) {
    await supabase
      .from("owner_statements")
      .update({ viewed_at: new Date().toISOString(), status: "viewed" })
      .eq("id", stmt.id)
  }

  const property = stmt.properties as unknown as { name: string; address_line1: string; city: string; owner_name: string } | null
  const periodDate = new Date(stmt.period_month)
  const periodLabel = periodDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
  const incomeLines = (stmt.income_lines as { unit: string; tenant: string; amount_paid_cents: number; status: string }[]) || []
  const expenseLines = (stmt.expense_lines as { description: string; contractor: string; amount_cents: number }[]) || []

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="Pleks" width={114} height={32} className="mx-auto mb-4" />
          <h1 className="font-heading text-2xl">Owner Statement — {periodLabel}</h1>
          <p className="text-muted-foreground">{property?.name}, {property?.city}</p>
          {property?.owner_name && <p className="text-sm text-muted-foreground">Prepared for: {property.owner_name}</p>}
        </div>

        {/* Net to owner highlight */}
        <Card className="mb-6 border-brand/30">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Net Payment</p>
            <p className="font-heading text-4xl text-brand">{formatZAR(stmt.net_to_owner_cents)}</p>
            {stmt.owner_payment_status === "paid" && stmt.owner_payment_date && (
              <p className="text-sm text-success mt-1">Paid on {new Date(stmt.owner_payment_date).toLocaleDateString("en-ZA")}</p>
            )}
          </CardContent>
        </Card>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Income</p><p className="font-heading text-lg">{formatZAR(stmt.gross_income_cents)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Expenses</p><p className="font-heading text-lg">{formatZAR(stmt.total_expenses_cents)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Mgmt Fee</p><p className="font-heading text-lg">{formatZAR(stmt.management_fee_cents + stmt.management_fee_vat_cents)}</p></CardContent></Card>
        </div>

        {/* Income detail */}
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-lg">Rental Income</CardTitle></CardHeader>
          <CardContent>
            {incomeLines.map((line, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{line.unit} — {line.tenant}</span>
                <span>{formatZAR(line.amount_paid_cents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Expenses detail */}
        {expenseLines.length > 0 && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-lg">Expenses</CardTitle></CardHeader>
            <CardContent>
              {expenseLines.map((line, i) => (
                <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span>{line.description} ({line.contractor})</span>
                  <span>{formatZAR(line.amount_cents)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {stmt.agent_notes && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{stmt.agent_notes}</p></CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center mt-8">
          Powered by Pleks · pleks.co.za
        </p>
      </div>
    </div>
  )
}
