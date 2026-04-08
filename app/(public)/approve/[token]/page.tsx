import { createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Image from "next/image"
import { formatZAR } from "@/lib/constants"
import { LandlordApprovalClient } from "./LandlordApprovalClient"

interface Props {
  params: Promise<{ token: string }>
}

export default async function LandlordApprovalPage({ params }: Props) {
  const { token } = await params

  const supabase = await createServiceClient()

  const { data: req } = await supabase
    .from("maintenance_requests")
    .select(`
      id, title, description, category, urgency, status,
      landlord_approval_token, estimated_cost_cents, quoted_cost_cents,
      landlord_approved_at, landlord_rejection_reason,
      units(unit_number, properties(name, address_line1, city, maintenance_approval_threshold_cents)),
      contractor_view(first_name, last_name, company_name, phone)
    `)
    .eq("landlord_approval_token", token)
    .single()

  if (!req) notFound()

  const unit = req.units as unknown as { unit_number: string; properties: { name: string; address_line1: string | null; city: string | null; maintenance_approval_threshold_cents: number | null } } | null
  const contractor = req.contractor_view as unknown as { first_name: string; last_name: string; company_name: string; phone: string } | null
  const contractorName = contractor ? (contractor.company_name || `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim()) : null
  const approvalThresholdCents = unit?.properties?.maintenance_approval_threshold_cents ?? 200000
  const costCents = req.quoted_cost_cents ?? req.estimated_cost_cents ?? null

  const URGENCY_LABEL: Record<string, string> = {
    emergency: "🚨 Emergency",
    urgent: "🟠 Urgent",
    routine: "🟡 Routine",
    cosmetic: "⚪ Cosmetic",
  }

  // Already actioned
  if (req.status === "landlord_approved" || req.status === "landlord_rejected") {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
          <Image src="/logo.svg" alt="Pleks" width={80} height={24} className="h-6 w-auto opacity-80" />
          <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-6 text-center space-y-2">
            <p className="text-lg font-semibold">
              {req.status === "landlord_approved" ? "✅ Approved" : "❌ Rejected"}
            </p>
            <p className="text-sm text-muted-foreground">
              {req.status === "landlord_approved"
                ? "You have already approved this maintenance request."
                : `You have already rejected this request${req.landlord_rejection_reason ? `: ${req.landlord_rejection_reason}` : "."}`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <Image src="/logo.svg" alt="Pleks" width={80} height={24} className="h-6 w-auto opacity-80" />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
            Maintenance Approval Required
          </p>
          <h1 className="font-heading text-2xl">
            A maintenance job at your property requires your approval.
          </h1>
        </div>

        {/* Job details */}
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3 text-sm">
          {unit && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Property</p>
              <p className="font-medium">{unit.properties.name} · {unit.unit_number}</p>
              {unit.properties.address_line1 && (
                <p className="text-muted-foreground">{unit.properties.address_line1}{unit.properties.city ? `, ${unit.properties.city}` : ""}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Job</p>
            <p className="font-medium">{req.title}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {req.category && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Category</p>
                <p className="capitalize">{req.category.replace(/_/g, " ")}</p>
              </div>
            )}
            {req.urgency && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Priority</p>
                <p>{URGENCY_LABEL[req.urgency] ?? req.urgency}</p>
              </div>
            )}
          </div>

          {contractorName && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Contractor</p>
              <p>{contractorName}{contractor?.phone ? ` · ${contractor.phone}` : ""}</p>
            </div>
          )}

          {costCents != null && (
            <div className="border-t border-border/60 pt-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{req.quoted_cost_cents ? "Quoted cost" : "Estimated cost"}</span>
                <span className="font-semibold">{formatZAR(costCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Approval limit</span>
                <span>{formatZAR(approvalThresholdCents)}</span>
              </div>
              {costCents > approvalThresholdCents && (
                <p className="text-xs text-warning mt-1">⚠️ This cost exceeds your approval limit — your approval is required before work can proceed.</p>
              )}
            </div>
          )}

          {req.description && (
            <div className="border-t border-border/60 pt-3">
              <p className="text-muted-foreground text-xs mb-1">Description</p>
              <p className="leading-relaxed whitespace-pre-wrap">{req.description}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <LandlordApprovalClient requestId={req.id} token={token} />
      </div>
    </div>
  )
}
