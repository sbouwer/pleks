import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { CreditCard } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const COLLECTION_STATUS_MAP: Record<string, "scheduled" | "pending" | "completed" | "arrears"> = {
  scheduled: "scheduled",
  submitted: "pending",
  successful: "completed",
  failed: "arrears",
  returned: "arrears",
  cancelled: "completed",
}

const MANDATE_STATUS_MAP: Record<string, "pending" | "active" | "arrears" | "completed"> = {
  pending_authentication: "pending",
  authenticated: "active",
  active: "active",
  failed_authentication: "arrears",
  suspended: "arrears",
  cancelled: "completed",
  amended: "completed",
}

export default async function DebiCheckPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get mandates
  const { data: mandates } = await supabase
    .from("debicheck_mandates")
    .select("id, status, amount_cents, billing_day, description, tenants(first_name, last_name), units(unit_number, properties(name))")
    .order("created_at", { ascending: false })

  // Get recent collections
  const { data: collections } = await supabase
    .from("debicheck_collections")
    .select("id, status, amount_cents, collection_date, failure_reason_human, is_retry, debicheck_mandates(description, tenants(first_name, last_name))")
    .order("collection_date", { ascending: false })
    .limit(30)

  const mandateList = mandates || []
  const collectionList = collections || []
  const activeMandates = mandateList.filter((m) => ["authenticated", "active"].includes(m.status))
  const successfulThisMonth = collectionList.filter((c) => c.status === "successful")
  const failedThisMonth = collectionList.filter((c) => c.status === "failed")

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">DebiCheck Collections</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Active Mandates</p><p className="font-heading text-2xl">{activeMandates.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Collections</p><p className="font-heading text-2xl">{collectionList.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Successful</p><p className="font-heading text-2xl text-success">{successfulThisMonth.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Failed</p><p className="font-heading text-2xl text-danger">{failedThisMonth.length}</p></CardContent></Card>
      </div>

      {/* Collections */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Recent Collections</CardTitle></CardHeader>
        <CardContent>
          {collectionList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collections yet.</p>
          ) : (
            <div className="space-y-2">
              {collectionList.map((col) => {
                const mandate = col.debicheck_mandates as unknown as { description: string; tenants: { first_name: string; last_name: string } } | null
                return (
                  <div key={col.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{mandate?.description || "Collection"}</p>
                      <p className="text-xs text-muted-foreground">
                        {col.collection_date}
                        {col.failure_reason_human && ` — ${col.failure_reason_human}`}
                        {col.is_retry && " (retry)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{formatZAR(col.amount_cents)}</span>
                      <StatusBadge status={COLLECTION_STATUS_MAP[col.status] || "pending"} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mandates */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Mandates</CardTitle></CardHeader>
        <CardContent>
          {mandateList.length === 0 ? (
            <EmptyState icon={<CreditCard className="h-8 w-8 text-muted-foreground" />} title="No mandates" description="DebiCheck mandates are created automatically when leases are signed with DebiCheck as payment method." />
          ) : (
            <div className="space-y-2">
              {mandateList.map((m) => {
                const tenant = m.tenants as unknown as { first_name: string; last_name: string } | null
                const unit = m.units as unknown as { unit_number: string; properties: { name: string } } | null
                return (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {tenant ? `${tenant.first_name} ${tenant.last_name}` : "—"}
                        {unit ? ` — ${unit.unit_number}, ${unit.properties.name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatZAR(m.amount_cents)}/mo · Day {m.billing_day}
                      </p>
                    </div>
                    <StatusBadge status={MANDATE_STATUS_MAP[m.status] || "pending"} />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
