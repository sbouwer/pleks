import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { InspectionActions } from "./InspectionActions"
import { CONDITION_OPTIONS } from "@/lib/inspections/roomTemplates"

const STATUS_MAP: Record<string, "scheduled" | "pending" | "active" | "completed" | "arrears"> = {
  scheduled: "scheduled",
  in_progress: "pending",
  completed: "completed",
  awaiting_tenant_review: "pending",
  disputed: "arrears",
  dispute_resolved: "completed",
  finalised: "completed",
}

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>
}) {
  const { inspectionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, units(unit_number, properties(name, address_line1)), tenants(first_name, last_name)")
    .eq("id", inspectionId)
    .single()

  if (!inspection) notFound()

  const { data: rooms } = await supabase
    .from("inspection_rooms")
    .select("*, inspection_items(*)")
    .eq("inspection_id", inspectionId)
    .order("display_order")

  const unit = inspection.units as unknown as { unit_number: string; properties: { name: string; address_line1: string } } | null
  const tenant = inspection.tenants as unknown as { first_name: string; last_name: string } | null

  const totalItems = (rooms || []).reduce((sum, r) => sum + ((r.inspection_items as unknown[]) || []).length, 0)
  const inspectedItems = (rooms || []).reduce((sum, r) =>
    sum + ((r.inspection_items as unknown as { condition: string | null }[]) || []).filter((i) => i.condition && i.condition !== "not_inspected").length, 0
  )

  const isResidential = inspection.lease_type === "residential"
  const disputeOpen = inspection.dispute_window_open && inspection.dispute_window_closes_at
  const disputeCloses = disputeOpen ? new Date(inspection.dispute_window_closes_at) : null
  const disputeDaysLeft = disputeCloses ? Math.max(0, Math.ceil((disputeCloses.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/inspections" className="hover:text-foreground">Inspections</Link> &rsaquo;{" "}
            {inspection.inspection_type.replaceAll("_", " ")}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl capitalize">{inspection.inspection_type.replaceAll("_", " ")}</h1>
            <StatusBadge status={STATUS_MAP[inspection.status] || "scheduled"} />
            <span className="text-xs capitalize text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded">
              {inspection.lease_type}
            </span>
          </div>
          <p className="text-muted-foreground">
            {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
            {tenant ? ` · ${tenant.first_name} ${tenant.last_name}` : ""}
          </p>
        </div>
        <InspectionActions inspectionId={inspectionId} status={inspection.status} leaseType={inspection.lease_type} />
      </div>

      {/* Dispute window banner (residential only) */}
      {isResidential && disputeOpen && (
        <Card className="mb-6 border-warning/30 bg-warning-bg">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Dispute window: {disputeDaysLeft} days remaining</p>
            <p className="text-xs text-muted-foreground">
              Tenant can dispute items until {disputeCloses?.toLocaleDateString("en-ZA")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">Progress</span>
            <span className="text-sm font-medium">{inspectedItems}/{totalItems} items</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: totalItems > 0 ? `${(inspectedItems / totalItems) * 100}%` : "0%" }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Rooms and items */}
      <div className="space-y-4">
        {(rooms || []).map((room) => {
          const items = (room.inspection_items as unknown as {
            id: string
            item_name: string
            condition: string | null
            condition_notes: string | null
            classification: string | null
            estimated_deduction_cents: number
          }[]) || []

          return (
            <Card key={room.id}>
              <CardHeader>
                <CardTitle className="text-lg">{room.room_label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((item) => {
                    const condOpt = CONDITION_OPTIONS.find((c) => c.value === item.condition)
                    return (
                      <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm">{item.item_name}</p>
                          {item.condition_notes && (
                            <p className="text-xs text-muted-foreground">{item.condition_notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.classification && (
                            <span className="text-xs px-2 py-0.5 bg-surface-elevated rounded capitalize">
                              {item.classification.replaceAll("_", " ")}
                            </span>
                          )}
                          {item.condition ? (
                            <span className={`text-xs font-medium ${condOpt?.color || ""}`}>
                              {condOpt?.label || item.condition}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {item.estimated_deduction_cents > 0 && (
                            <span className="text-xs text-danger">{formatZAR(item.estimated_deduction_cents)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Deduction summary (move-out) */}
      {inspection.recommended_deductions_cents > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Deduction Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm">
              <span>Recommended deductions</span>
              <span className="font-heading text-lg text-danger">{formatZAR(inspection.recommended_deductions_cents)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
