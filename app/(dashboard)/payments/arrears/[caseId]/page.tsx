import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { ArrearsActions } from "./ArrearsActions"

export default async function ArrearsDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: arrearsCase } = await supabase
    .from("arrears_cases")
    .select("*, tenants(first_name, last_name, company_name, tenant_type, email, phone), units(unit_number, properties(name))")
    .eq("id", caseId)
    .single()

  if (!arrearsCase) notFound()

  const { data: actions } = await supabase
    .from("arrears_actions")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })

  const tenant = arrearsCase.tenants as unknown as { first_name: string; last_name: string; company_name: string; tenant_type: string; email: string; phone: string } | null
  const unit = arrearsCase.units as unknown as { unit_number: string; properties: { name: string } } | null
  const tenantName = tenant?.tenant_type === "company"
    ? tenant.company_name
    : `${tenant?.first_name || ""} ${tenant?.last_name || ""}`.trim()

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/payments/arrears" className="hover:text-foreground">Arrears</Link> &rsaquo; {tenantName}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{tenantName}</h1>
            <StatusBadge status={arrearsCase.status === "open" ? "arrears" : arrearsCase.status === "resolved" ? "completed" : "pending"} />
          </div>
          <p className="text-muted-foreground">
            {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
            {` · ${arrearsCase.lease_type}`}
          </p>
        </div>
        <ArrearsActions caseId={caseId} status={arrearsCase.status} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Arrears</p><p className="font-heading text-2xl text-danger">{formatZAR(arrearsCase.total_arrears_cents)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Months</p><p className="font-heading text-2xl">{arrearsCase.months_in_arrears}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Current Step</p><p className="font-heading text-2xl">{arrearsCase.current_step}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sequence</p><p className="text-sm">{arrearsCase.sequence_paused ? "Paused" : "Active"}</p></CardContent></Card>
      </div>

      {/* Payment arrangement */}
      {arrearsCase.status === "payment_arrangement" && arrearsCase.arrangement_amount_cents && (
        <Card className="mb-6 border-info/30 bg-info-bg">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Payment Arrangement</p>
            <p className="text-sm text-muted-foreground">
              {formatZAR(arrearsCase.arrangement_amount_cents)}/month from {arrearsCase.arrangement_start_date}
              {arrearsCase.arrangement_notes && ` — ${arrearsCase.arrangement_notes}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Contact info */}
      {tenant && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Contact</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {tenant.email && <p>{tenant.email}</p>}
            {tenant.phone && <p>{tenant.phone}</p>}
          </CardContent>
        </Card>
      )}

      {/* Actions timeline */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Actions Timeline</CardTitle></CardHeader>
        <CardContent>
          {(!actions || actions.length === 0) ? (
            <p className="text-sm text-muted-foreground">No actions taken yet. Sequence will advance automatically.</p>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => (
                <div key={action.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{action.action_type.replaceAll("_", " ")}</span>
                      {action.step_number && <span className="text-xs text-muted-foreground">Step {action.step_number}</span>}
                      {action.ai_drafted && <span className="text-xs text-info">AI drafted</span>}
                    </div>
                    {action.subject && <p className="text-muted-foreground">{action.subject}</p>}
                    {action.body && <p className="text-muted-foreground whitespace-pre-wrap">{action.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(action.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
