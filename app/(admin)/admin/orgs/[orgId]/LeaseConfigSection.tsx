/**
 * app/(admin)/admin/orgs/[orgId]/LeaseConfigSection.tsx — Lease configuration card for admin org detail page
 *
 * Auth:   requireAdminAuth (parent page)
 * Data:   props from AdminOrgDetailPage server component
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineLink } from "@/components/ui/actions"
import { SA_TIMEZONE } from "@/lib/dates"

interface LeaseConfigSectionProps {
  orgId: string
  clauseEditConfirmedAt: string | null
  clauseEditConfirmedIp: string | null
  customTemplateActive: boolean
}

export function LeaseConfigSection({
  orgId,
  clauseEditConfirmedAt,
  clauseEditConfirmedIp,
  customTemplateActive,
}: Readonly<LeaseConfigSectionProps>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Lease configuration</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {clauseEditConfirmedAt ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="text-amber-500 text-xs">⚠</span>
            <div>
              <p className="text-xs font-medium text-amber-200">Clause editing enabled</p>
              <p className="text-xs text-muted-foreground">
                Confirmed on {new Date(clauseEditConfirmedAt).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}
                {clauseEditConfirmedIp && ` from ${clauseEditConfirmedIp}`}
              </p>
              <InlineLink href={`/admin/orgs/${orgId}/lease-clauses`} className="mt-1">View edited clauses</InlineLink>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Standard Pleks template — no custom clause edits</p>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Custom template:</span>
          <span>{customTemplateActive ? "Active" : "Not configured"}</span>
        </div>
      </CardContent>
    </Card>
  )
}
