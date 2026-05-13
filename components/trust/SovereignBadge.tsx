/**
 * components/trust/SovereignBadge.tsx — Structural badge asserting the sovereign-trust invariant (D-TRUST-01)
 *
 * Auth:   N/A — pure presentational, no data fetching
 * Notes:  Server-component-friendly. The page is responsible for fetching and passing props.
 *         Agent variant: shows the agency's own bank account and FFC number.
 *         Admin variant: shows the cross-agency observability statement.
 *         Canonical viewer: PPRA auditor in a sales demo — visible but not dominant.
 */
import { Landmark } from "lucide-react"
import { Card } from "@/components/ui/card"

export type SovereignBadgeProps =
  | {
      variant: "agent"
      bankName: string
      bankAccountLast4: string
      agencyName: string
      ffcNumber: string | null
    }
  | { variant: "admin" }

export function SovereignBadge(props: Readonly<SovereignBadgeProps>) {
  if (props.variant === "admin") {
    return (
      <Card className="p-4 bg-muted/30 w-full">
        <div className="flex items-start gap-3">
          <Landmark className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
              Cross-agency trust observability
            </p>
            <p className="text-sm mt-1">Pleks does not hold client funds for any agency.</p>
            <p className="text-sm font-medium">All trust accounts are sovereign to the agency.</p>
          </div>
        </div>
      </Card>
    )
  }

  const { bankName, bankAccountLast4, agencyName, ffcNumber } = props

  return (
    <Card className="p-4 bg-muted/30 w-full">
      <div className="flex items-start gap-3">
        <Landmark className="size-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
            Sovereign trust account
          </p>
          <p className="text-sm mt-1">
            Your agency&apos;s {bankName} ····{bankAccountLast4}
          </p>
          {ffcNumber ? (
            <p className="text-sm">Managed by {agencyName} · FFC {ffcNumber}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Managed by {agencyName} · FFC not on file</p>
          )}
          <p className="text-sm font-medium mt-1">Pleks does not hold funds.</p>
        </div>
      </div>
    </Card>
  )
}
