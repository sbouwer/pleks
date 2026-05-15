/**
 * components/popia/ConsentHistoryView.tsx — Consent log viewer (filterable, version-linked)
 *
 * Auth:   N/A — pure presentational; consent data fetched by parent server component
 * Notes:  Shows every consent_log entry for the subject with a soft link to the
 *         privacy_policy_versions.version in effect at the time of consent.
 *         consent_withdrawal request type links back here for the subject to identify
 *         which consent_log.id they wish to withdraw.
 */
import { CheckCircle2, XCircle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface ConsentEntry {
  id: string
  consent_type: string
  consent_version: string | null
  consent_given: boolean
  created_at: string
  ip_address?: string | null
  verification_status?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  credit_check: "Credit check authorisation",
  data_processing: "Data processing consent",
  marketing: "Marketing communications",
  trust_account_notice: "Trust account notice",
  popia_application: "POPIA application consent",
  lease_template_disclaimer: "Lease template disclaimer",
  criminal_record_check: "Criminal record check",
}

interface ConsentHistoryViewProps {
  entries: ConsentEntry[]
  onWithdrawConsent?: (entry: ConsentEntry) => void
  className?: string
}

export function ConsentHistoryView({
  entries,
  onWithdrawConsent,
  className,
}: Readonly<ConsentHistoryViewProps>) {
  if (entries.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No consent events recorded yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your consent history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every consent event recorded for your account. This log is immutable — entries are never deleted.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {entries.map((entry) => (
            <ConsentRow
              key={entry.id}
              entry={entry}
              onWithdraw={onWithdrawConsent ? () => onWithdrawConsent(entry) : undefined}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ConsentRow({
  entry,
  onWithdraw,
}: Readonly<{ entry: ConsentEntry; onWithdraw?: () => void }>) {
  const label = TYPE_LABELS[entry.consent_type] ?? entry.consent_type
  const date = new Date(entry.created_at).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="flex items-start gap-2 min-w-0">
        {entry.consent_given ? (
          <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-600" />
        ) : (
          <XCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
          {entry.consent_version && (
            <p className="text-xs text-muted-foreground">
              Policy version{" "}
              <a
                href={`/privacy/versions/${entry.consent_version}`}
                className="underline hover:text-foreground transition-colors"
              >
                {entry.consent_version}
              </a>
            </p>
          )}
          {entry.verification_status === "verified" && (
            <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5">
              <Clock className="size-3" /> Identity verified
            </p>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 shrink-0">
        <Badge variant={entry.consent_given ? "secondary" : "destructive"} className="text-xs">
          {entry.consent_given ? "Given" : "Withdrawn"}
        </Badge>
        {entry.consent_given && onWithdraw && (
          <button
            type="button"
            onClick={onWithdraw}
            className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Withdraw
          </button>
        )}
      </div>
    </div>
  )
}
