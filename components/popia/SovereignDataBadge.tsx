/**
 * components/popia/SovereignDataBadge.tsx — Sovereign-data invariant badge (D-POPIA-SIBLING)
 *
 * Auth:   N/A — pure presentational, no data fetching
 * Notes:  Sibling to components/trust/SovereignBadge.tsx (BUILD_64 D-TRUST-01).
 *         Agent variant: shows agency's Responsible-Party posture.
 *         Subject variant: confirms Pleks is Operator, agency is Responsible Party.
 *         Admin variant: cross-agency observability statement.
 */
import { ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"

export type SovereignDataBadgeProps =
  | { variant: "agent"; agencyName: string }
  | { variant: "subject"; agencyName: string }
  | { variant: "admin" }

export function SovereignDataBadge(props: Readonly<SovereignDataBadgeProps>) {
  if (props.variant === "admin") {
    return (
      <Card className="p-4 bg-muted/30 w-full">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
              Cross-agency data observability
            </p>
            <p className="text-sm mt-1">Pleks is the Operator for all agency data.</p>
            <p className="text-sm font-medium">Each agency remains the Responsible Party for its own data.</p>
          </div>
        </div>
      </Card>
    )
  }

  if (props.variant === "agent") {
    return (
      <Card className="p-4 bg-muted/30 w-full">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
              Sovereign data
            </p>
            <p className="text-sm mt-1">
              {props.agencyName} is the Responsible Party for all client data.
            </p>
            <p className="text-sm font-medium">Pleks processes data on your behalf — never on its own account.</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 bg-muted/30 w-full">
      <div className="flex items-start gap-3">
        <ShieldCheck className="size-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
            Your data rights
          </p>
          <p className="text-sm mt-1">
            {props.agencyName} holds and is responsible for your data.
          </p>
          <p className="text-sm font-medium">
            Pleks manages it on their behalf. Your rights are with {props.agencyName}.
          </p>
        </div>
      </div>
    </Card>
  )
}
