import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { Download } from "lucide-react"
import { formatZAR } from "@/lib/constants"

export default async function LandlordStatementsPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties } = await service
    .from("properties")
    .select("id, name")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")

  const propertyIds = (properties ?? []).map((p) => p.id)

  const { data: statements } = propertyIds.length > 0
    ? await service
        .from("owner_statements")
        .select("id, property_id, period_month, gross_income_cents, total_expenses_cents, net_to_owner_cents, owner_payment_status, owner_payment_date, pdf_storage_path, status")
        .eq("landlord_id", session.landlordId)
        .in("property_id", propertyIds)
        .in("status", ["generated", "sent", "viewed"])
        .order("period_month", { ascending: false })
    : { data: [] }

  type Statement = NonNullable<typeof statements>[number]
  const byProperty: Record<string, Statement[]> = {}
  for (const s of statements ?? []) {
    byProperty[s.property_id] = byProperty[s.property_id] ?? []
    byProperty[s.property_id].push(s)
  }

  const propMap = Object.fromEntries((properties ?? []).map((p) => [p.id, p.name]))

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-heading text-3xl">Owner statements</h1>

      {(statements ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No statements available yet. Your agent will generate statements monthly.</p>
      )}

      {Object.entries(byProperty).map(([propId, stmts]) => (
        <div key={propId} className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4">
          <p className="text-sm font-semibold mb-3">{propMap[propId] ?? "Property"}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground/70 uppercase tracking-wider border-b border-border/60">
                  <th className="pb-2 text-left font-medium">Period</th>
                  <th className="pb-2 text-right font-medium">Rent collected</th>
                  <th className="pb-2 text-right font-medium">Expenses</th>
                  <th className="pb-2 text-right font-medium">Net to you</th>
                  <th className="pb-2 text-center font-medium">Status</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(stmts ?? []).map((s) => {
                  const period = new Date(s.period_month).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
                  return (
                    <tr key={s.id}>
                      <td className="py-2.5 text-muted-foreground">{period}</td>
                      <td className="py-2.5 text-right">{formatZAR(s.gross_income_cents)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{formatZAR(s.total_expenses_cents)}</td>
                      <td className="py-2.5 text-right font-semibold">{formatZAR(s.net_to_owner_cents)}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-xs ${s.owner_payment_status === "paid" ? "text-success" : "text-muted-foreground"}`}>
                          {s.owner_payment_status === "paid" ? "Paid ✓" : "Pending"}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {s.pdf_storage_path ? (
                          <a
                            href={`/api/statements/${s.id}/download`}
                            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
