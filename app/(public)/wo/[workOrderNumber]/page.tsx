import { createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Image from "next/image"
import { formatZAR } from "@/lib/constants"
import { ContractorTrackingClient } from "./ContractorTrackingClient"

interface Props {
  params: Promise<{ workOrderNumber: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function WorkOrderPage({ params, searchParams }: Props) {
  const { workOrderNumber } = await params
  const { token } = await searchParams

  const supabase = await createServiceClient()

  const { data: req } = await supabase
    .from("maintenance_requests")
    .select(`
      id, work_order_number, work_order_token, title, description, category, urgency,
      status, access_instructions, special_instructions, estimated_cost_cents,
      quoted_cost_cents, actual_cost_cents, created_at,
      units(unit_number, access_instructions, properties(name, address_line1, city)),
      contractor_view(id, first_name, last_name, company_name, phone, email)
    `)
    .eq("work_order_number", workOrderNumber)
    .single()

  if (!req) notFound()

  // Token auth — must match work_order_token
  if (!token || req.work_order_token !== token) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold mb-2">Invalid or missing access link</p>
          <p className="text-sm text-muted-foreground">
            This work order link is invalid. Please use the link from your work order email.
          </p>
        </div>
      </div>
    )
  }

  const unit = req.units as unknown as { unit_number: string; access_instructions: string | null; properties: { name: string; address_line1: string | null; city: string | null } } | null

  const URGENCY_LABEL: Record<string, string> = {
    emergency: "🚨 EMERGENCY",
    urgent: "🟠 URGENT",
    routine: "🟡 ROUTINE",
    cosmetic: "⚪ COSMETIC",
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Image src="/logo.svg" alt="Pleks" width={80} height={24} className="h-6 w-auto opacity-80" />
        </div>

        {/* Work order header */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Work Order</p>
          <h1 className="font-heading text-2xl">{req.work_order_number}</h1>
          {unit && (
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>{unit.properties.name} · {unit.unit_number}</p>
              {unit.properties.address_line1 && (
                <p>{unit.properties.address_line1}{unit.properties.city ? `, ${unit.properties.city}` : ""}</p>
              )}
            </div>
          )}
        </div>

        {/* Job details */}
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold">{req.title}</h2>
            {req.urgency && (() => {
              let urgencyClass: string
              if (req.urgency === "emergency") { urgencyClass = "text-danger" }
              else if (req.urgency === "urgent") { urgencyClass = "text-warning" }
              else { urgencyClass = "text-muted-foreground" }
              return (
                <span className={`text-xs font-bold shrink-0 ${urgencyClass}`}>
                  {URGENCY_LABEL[req.urgency] ?? req.urgency.toUpperCase()}
                </span>
              )
            })()}
          </div>
          {req.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{req.description}</p>
          )}
          {req.estimated_cost_cents && (
            <p className="text-sm">
              <span className="text-muted-foreground">Estimated: </span>
              {formatZAR(req.estimated_cost_cents)}
            </p>
          )}
        </div>

        {/* Access instructions */}
        {(req.access_instructions ?? unit?.access_instructions) && (
          <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Access</p>
            <p className="text-sm leading-relaxed">{req.access_instructions ?? unit?.access_instructions}</p>
            {req.special_instructions && (
              <p className="text-sm text-muted-foreground">{req.special_instructions}</p>
            )}
          </div>
        )}

        {/* Status + actions */}
        <ContractorTrackingClient
          requestId={req.id}
          workOrderNumber={req.work_order_number ?? ""}
          token={token}
          currentStatus={req.status}
        />
      </div>
    </div>
  )
}
