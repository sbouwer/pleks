/**
 * components/popia/RetentionDashboard.tsx — Per-category retention status dashboard
 *
 * Auth:   N/A — pure presentational; data fetched by parent server component
 * Notes:  D-POPIA-02: surfaces retention windows per category with eligible-deletion dates.
 *         Used in /tenant/privacy/retention and /settings/privacy/retention.
 */
import { Clock, Lock, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DataCategory, RetentionDecision } from "@/lib/popia/retention"
import { cn } from "@/lib/utils"

interface RetentionRow {
  category: DataCategory
  decision: RetentionDecision
}

const CATEGORY_LABELS: Record<DataCategory, string> = {
  trust_account_records: "Trust account records",
  lease_documents: "Lease documents & amendments",
  inspection_photos: "Inspection photos",
  inspection_reports: "Inspection reports",
  rent_ledger: "Rent ledger & invoices",
  communications: "Communications (SMS, WhatsApp, email)",
  rejected_applications: "Rental applications",
  credit_checks: "Credit check results",
  consent_log: "Consent log",
  audit_log: "Activity & audit log",
  maintenance_records: "Maintenance records",
  platform_account: "Platform account data",
}

interface RetentionDashboardProps {
  rows: RetentionRow[]
  className?: string
}

export function RetentionDashboard({ rows, className }: Readonly<RetentionDashboardProps>) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your data retention overview</CardTitle>
        <p className="text-sm text-muted-foreground">
          Retention periods are set by South African law. Pleks cannot waive legally mandated retention.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.map(({ category, decision }) => (
            <RetentionRow key={category} category={category} decision={decision} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RetentionRow({ category, decision }: Readonly<RetentionRow>) {
  const label = CATEGORY_LABELS[category] ?? category

  if ("erasable" in decision && decision.erasable) {
    return (
      <div className="flex items-center justify-between py-3 gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="size-4 shrink-0 text-green-600" />
          <span className="text-sm truncate">{label}</span>
        </div>
        <Badge variant="outline" className="shrink-0 text-green-700 border-green-200">
          Eligible for deletion
        </Badge>
      </div>
    )
  }

  if ("anonymisable" in decision && decision.anonymisable) {
    return (
      <div className="flex items-start justify-between py-3 gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="size-4 shrink-0 text-amber-600" />
          <span className="text-sm truncate">{label}</span>
        </div>
        <div className="text-right shrink-0">
          <Badge variant="outline" className="text-amber-700 border-amber-200">
            Anonymisable
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">{decision.reason}</p>
        </div>
      </div>
    )
  }

  const retained = decision as { erasable: false; retained_until: Date; reason: string; legal_basis: string }

  return (
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <Lock className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm truncate">{label}</span>
      </div>
      <div className="text-right shrink-0">
        {retained.retained_until.getFullYear() > 9000 ? (
          <Badge variant="outline" className="text-muted-foreground">
            Immutable
          </Badge>
        ) : (
          <>
            <Badge variant="outline" className="text-muted-foreground">
              Until {retained.retained_until.toLocaleDateString("en-ZA")}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">{retained.reason}</p>
          </>
        )}
      </div>
    </div>
  )
}
