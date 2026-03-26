import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "draft" | "scheduled" | "active" | "completed"> = {
  draft: "draft",
  generated: "scheduled",
  sent: "active",
  viewed: "completed",
  archived: "completed",
}

export default async function StatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: statements } = await supabase
    .from("owner_statements")
    .select("id, period_month, gross_income_cents, total_expenses_cents, management_fee_cents, net_to_owner_cents, status, owner_payment_status, properties(name)")
    .order("period_month", { ascending: false })
    .limit(50)

  const list = statements || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">Owner Statements</h1>
        <Button variant="outline">Generate Statements</Button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8 text-muted-foreground" />} title="No statements yet" description="Statements are generated automatically on the 2nd of each month." />
      ) : (
        <div className="space-y-2">
          {list.map((stmt) => {
            const property = stmt.properties as unknown as { name: string } | null
            const periodDate = new Date(stmt.period_month)
            const periodLabel = periodDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })

            return (
              <Link key={stmt.id} href={`/statements/${stmt.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{property?.name || "—"} — {periodLabel}</p>
                      <p className="text-sm text-muted-foreground">
                        Income: {formatZAR(stmt.gross_income_cents)} · Expenses: {formatZAR(stmt.total_expenses_cents)} · Fee: {formatZAR(stmt.management_fee_cents)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading">{formatZAR(stmt.net_to_owner_cents)}</span>
                      <StatusBadge status={STATUS_MAP[stmt.status] || "draft"} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
