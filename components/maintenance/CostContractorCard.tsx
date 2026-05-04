/**
 * components/maintenance/CostContractorCard.tsx — contractor assignment + cost summary card
 *
 * Data:   props from server page — no fetching
 * Notes:  Shows current contractor with change affordance, plus estimated vs actual cost.
 *         ChangeContractorDialog only shown when not in terminal state.
 */

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

const TERMINAL = ["completed", "closed", "cancelled", "rejected"]

export function CostContractorCard({
  requestId, status, contractorId, contractorName, contractorPhone,
  contractorEmail, contractors, estimatedCostCents, actualCostCents, workOrderNumber,
}: Readonly<Props>) {
  const isReadOnly = TERMINAL.includes(status)
  const isOver = actualCostCents && estimatedCostCents && actualCostCents > estimatedCostCents

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Contractor & Cost</CardTitle>
          {!isReadOnly && (
            <ChangeContractorDialog
              requestId={requestId}
              currentContractorId={contractorId}
              contractors={contractors}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div>
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

        {isOver && estimatedCostCents && actualCostCents && (
          <p className="text-xs text-danger">
            +{formatZAR(actualCostCents - estimatedCostCents)} over estimate
          </p>
        )}
      </CardContent>
    </Card>
  )
}
