/**
 * app/(dashboard)/statements/page.tsx — Owner statements list: generated monthly per property.
 *
 * Route:  /statements
 * Auth:   gatewaySSR
 * Data:   owner_statements via service client with explicit org_id filter (Pattern A)
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"

const STATUS_MAP: Record<string, "draft" | "scheduled" | "active" | "completed"> = {
  draft: "draft",
  generated: "scheduled",
  sent: "active",
  viewed: "completed",
  archived: "completed",
}

export default async function StatementsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { db, orgId } = gw
  const { data: statements } = await db
    .from("owner_statements")
    .select("id, period_month, gross_income_cents, total_expenses_cents, management_fee_cents, net_to_owner_cents, status, owner_payment_status, properties(name)")
    .eq("org_id", orgId)
    .order("period_month", { ascending: false })
    .limit(50)

  const list = statements || []

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Finance"
        title="Owner Statements"
        headline="Monthly owner statements"
        sub="Income, expenses, fees and net per property — generated on the 2nd each month."
        action={<button type="button" className="pa-secondary">Generate Statements</button>}
      />


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
