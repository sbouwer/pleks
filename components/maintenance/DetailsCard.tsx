/**
 * components/maintenance/DetailsCard.tsx — request details card on maintenance detail page
 *
 * Data:   all props from server page — no fetching
 * Notes:  Edit button opens MaintenanceEditDialog (client). Read-only in terminal states.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MaintenanceEditDialog } from "./dialogs/MaintenanceEditDialog"

interface Props {
  requestId: string
  status: string
  title: string
  description: string | null
  category: string | null
  categoryOverride: string | null
  urgency: string | null
  urgencyOverride: string | null
  accessInstructions: string | null
  specialInstructions: string | null
  contactName: string | null
  contactPhone: string | null
  estimatedCostCents: number | null
  scheduledDate: string | null
  scheduledTimeFrom: string | null
  scheduledTimeTo: string | null
  tenantName: string | null
  tenantPhone: string | null
  propertyName: string | null
  unitNumber: string | null
}

const TERMINAL = ["completed", "closed", "cancelled", "rejected"]

export function DetailsCard(props: Readonly<Props>) {
  const {
    requestId, status, title, description, category, categoryOverride,
    urgency, urgencyOverride, accessInstructions, specialInstructions,
    contactName, contactPhone, estimatedCostCents, scheduledDate,
    scheduledTimeFrom, scheduledTimeTo, tenantName, tenantPhone,
    propertyName, unitNumber,
  } = props
  const isReadOnly = TERMINAL.includes(status)
  const displayCategory = categoryOverride ?? category
  const displayUrgency  = urgencyOverride  ?? urgency

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Details</CardTitle>
          {!isReadOnly && (
            <MaintenanceEditDialog
              requestId={requestId}
              current={{
                title, description: description ?? "",
                category_override: categoryOverride,
                urgency_override: urgencyOverride,
                access_instructions: accessInstructions,
                special_instructions: specialInstructions,
                contact_name: contactName,
                contact_phone: contactPhone,
                estimated_cost_cents: estimatedCostCents,
                scheduled_date: scheduledDate,
                scheduled_time_from: scheduledTimeFrom,
                scheduled_time_to: scheduledTimeTo,
              }}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
          <p className="whitespace-pre-wrap leading-relaxed">{description ?? "—"}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Category</p>
            <p>{displayCategory ?? "—"}{categoryOverride && categoryOverride !== category && <span className="text-xs text-muted-foreground ml-1">(agent override)</span>}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Urgency</p>
            <p className="capitalize">{displayUrgency ?? "—"}{urgencyOverride && urgencyOverride !== urgency && <span className="text-xs text-muted-foreground ml-1">(override)</span>}</p>
          </div>
        </div>

        {(accessInstructions || contactName || contactPhone) && (
          <div className="pt-2 border-t border-border space-y-2">
            {contactName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Access contact</p>
                <p>{contactName}{contactPhone ? <span className="text-muted-foreground ml-2 font-mono">{contactPhone}</span> : null}</p>
              </div>
            )}
            {accessInstructions && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Access instructions</p>
                <p className="text-muted-foreground">{accessInstructions}</p>
              </div>
            )}
          </div>
        )}

        {specialInstructions && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-0.5">Special instructions</p>
            <p className="text-muted-foreground">{specialInstructions}</p>
          </div>
        )}

        {(propertyName || tenantName) && (
          <div className="pt-2 border-t border-border space-y-2">
            {propertyName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Property</p>
                <p>{unitNumber ? `Unit ${unitNumber}, ` : ""}{propertyName}</p>
              </div>
            )}
            {tenantName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tenant</p>
                <p>{tenantName}{tenantPhone ? <span className="text-muted-foreground ml-2 font-mono">{tenantPhone}</span> : null}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
