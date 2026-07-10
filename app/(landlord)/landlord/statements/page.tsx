/**
 * app/(landlord)/landlord/statements/page.tsx — landlord portal: owner statements grouped by property
 *
 * Route:  /landlord/statements
 * Auth:   getLandlordSession (token-gated); scoped to landlord_id
 * Data:   createServiceClient — properties → owner_statements
 * Notes:  Canon ResourcePageHeader + DetailCard / EmptyResourceState (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { Download, FileText } from "lucide-react"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { DetailCard } from "@/components/detail/DetailCard"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtZA } from "@/lib/dates"

export default async function LandlordStatementsPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties, error: propertiesError } = await service
    .from("properties")
    .select("id, name")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")
    logQueryError("LandlordStatementsPage properties", propertiesError)

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

  if ((statements ?? []).length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Landlord"
        title="Owner statements"
        headline="No statements yet"
        headerSub="Your agent generates statements monthly."
        emptyTitle="No statements available yet"
        emptySub="Your managing agent generates owner statements monthly — they'll appear here."
        icon={<FileText className="h-6 w-6" />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Landlord" title="Owner statements" headline="Your monthly statements by property" />

      {Object.entries(byProperty).map(([propId, stmts]) => (
        <DetailCard key={propId} title={propMap[propId] ?? "Property"}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Period</th>
                  <th className="pb-2 text-right font-medium">Rent collected</th>
                  <th className="pb-2 text-right font-medium">Expenses</th>
                  <th className="pb-2 text-right font-medium">Net to you</th>
                  <th className="pb-2 text-center font-medium">Status</th>
                  <th className="w-10 pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(stmts ?? []).map((s) => {
                  const period = fmtZA(s.period_month, { month: "long", year: "numeric" })
                  return (
                    <tr key={s.id}>
                      <td className="py-2.5 text-muted-foreground">{period}</td>
                      <td className="py-2.5 text-right text-foreground">{formatZAR(s.gross_income_cents)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{formatZAR(s.total_expenses_cents)}</td>
                      <td className="py-2.5 text-right font-semibold text-foreground">{formatZAR(s.net_to_owner_cents)}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-xs ${s.owner_payment_status === "paid" ? "text-success" : "text-muted-foreground"}`}>
                          {s.owner_payment_status === "paid" ? "Paid ✓" : "Pending"}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {s.pdf_storage_path ? (
                          <a
                            href={`/api/statements/${s.id}/download`}
                            className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DetailCard>
      ))}
    </div>
  )
}
