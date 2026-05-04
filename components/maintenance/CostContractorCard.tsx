/**
 * components/maintenance/CostContractorCard.tsx — contractor assignment + cost summary card
 *
 * Data:   props from server page — no fetching
 * Notes:  Shows current contractor with change affordance, plus estimated vs actual cost.
 *         h-full flex-col so it stretches to match its grid-row partner (DetailsCard).
 */

import { Wrench } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChangeContractorDialog } from "./dialogs/ChangeContractorDialog"
import { formatZAR } from "@/lib/constants"

interface Contractor {
  id: string
  name: string
}

interface Props {
  requestId: string
  status: string
  contractorId: string | null
  contractorName: string | null
  contractorPhone: string | null
  contractorEmail: string | null
  contractors: Contractor[]
  estimatedCostCents: number | null
  actualCostCents: number | null
  workOrderNumber: string | null
}

const TERMINAL = new Set(["completed", "closed", "cancelled", "rejected"])

export function CostContractorCard({
  requestId, status, contractorId, contractorName, contractorPhone,
  contractorEmail, contractors, estimatedCostCents, actualCostCents, workOrderNumber,
}: Readonly<Props>) {
  const isReadOnly = TERMINAL.has(status)
  const isOver = Boolean(actualCostCents && estimatedCostCents && actualCostCents > estimatedCostCents)

  return (
    <Card className="flex flex-col h-full min-h-[260px]">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Contractor & Cost</CardTitle>
          </div>
          {!isReadOnly && (
            <ChangeContractorDialog
              requestId={requestId}
              currentContractorId={contractorId}
              contractors={contractors}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm flex flex-col flex-1 min-h-0 overflow-y-auto pb-4">
        {/* flex-1 so contractor block expands to align first divider with DetailsCard */}
        <div className="flex-1 min-h-[3rem] pb-2">
          <p className="text-xs text-muted-foreground mb-0.5">Contractor</p>
          {contractorName ? (
            <div>
              <p className="font-medium">{contractorName}</p>
              {contractorPhone && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{contractorPhone}</p>
              )}
              {contractorEmail && (
                <p className="text-xs text-muted-foreground mt-0.5">{contractorEmail}</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Unassigned</p>
          )}
        </div>

        {workOrderNumber && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-0.5">Work order</p>
            <p className="font-mono text-sm">{workOrderNumber}</p>
          </div>
        )}

        <div className="pt-2 border-t border-border grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Estimated cost</p>
            <p className="font-mono">
              {estimatedCostCents ? formatZAR(estimatedCostCents) : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Actual cost</p>
            <p className={`font-mono ${isOver ? "text-danger" : ""}`}>
              {actualCostCents ? formatZAR(actualCostCents) : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
        </div>

        {isOver && actualCostCents !== null && estimatedCostCents !== null && (
          <p className="text-xs text-danger">
            +{formatZAR(actualCostCents - estimatedCostCents)} over estimate
          </p>
        )}
      </CardContent>
    </Card>
  )
}
