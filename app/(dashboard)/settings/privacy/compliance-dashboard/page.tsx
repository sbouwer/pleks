/**
 * app/(dashboard)/settings/privacy/compliance-dashboard/page.tsx — Org POPIA compliance overview
 *
 * Route:  /settings/privacy/compliance-dashboard
 * Auth:   gatewaySSR() — org member
 * Data:   data_subject_requests stats; retention_purge_runs for last run; consent coverage
 * Notes:  D-POPIA-16: aggregate compliance health — open requests, overdue, SLA trend,
 *         purge history. Un-consented contacts list for agencies with legacy imports.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestStats, getOverdueRequests } from "@/lib/popia/requests"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { CheckCircle2, AlertTriangle, Clock, ShieldCheck } from "lucide-react"

export const metadata = { title: "Compliance dashboard" }

export default async function ComplianceDashboardPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { orgId } = gw

  const db = createServiceClient()

  const [stats, overdueRequests, lastPurgeResult] = await Promise.all([
    getRequestStats(orgId, 3),
    getOverdueRequests(orgId),
    (await db)
      .from("retention_purge_runs")
      .select("id, status, run_started_at, run_completed_at, records_by_category, errors")
      .eq("org_id", orgId)
      .order("run_started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastPurge = lastPurgeResult.data
  const lastPurgeDate = lastPurge?.run_completed_at
    ? new Date(lastPurge.run_completed_at).toLocaleDateString("en-ZA")
    : "Never"

  let complianceHealth: "healthy" | "warning" | "at-risk" = "healthy"
  if (overdueRequests.length > 0) complianceHealth = "at-risk"
  else if (stats.open > 10) complianceHealth = "warning"

  const healthConfig = {
    "healthy": { icon: CheckCircle2, label: "Healthy", color: "text-green-600", border: "" },
    "warning": { icon: Clock, label: "Attention needed", color: "text-amber-600", border: "border-amber-200" },
    "at-risk": { icon: AlertTriangle, label: "At risk — overdue requests", color: "text-destructive", border: "border-destructive" },
  }[complianceHealth]

  const HealthIcon = healthConfig.icon

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Compliance dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your POPIA compliance health at a glance — open requests, SLA status, and retention
          purge history.
        </p>
      </div>

      {/* Health banner */}
      <Card className={healthConfig.border}>
        <CardContent className="pt-4 pb-3 flex items-center gap-3">
          <HealthIcon className={`size-5 shrink-0 ${healthConfig.color}`} />
          <div>
            <p className={`text-sm font-medium ${healthConfig.color}`}>{healthConfig.label}</p>
            {overdueRequests.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {overdueRequests.length} request{overdueRequests.length > 1 ? "s" : ""} past the
                30-day SLA — action required
              </p>
            )}
          </div>
          {overdueRequests.length > 0 && (
            <ActionButton asChild tone="secondary" size="sm" className="ml-auto h-7 text-xs">
              <Link href="/settings/privacy/data-subject-requests">
                View overdue
              </Link>
            </ActionButton>
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open requests", value: stats.open },
          { label: "Overdue", value: overdueRequests.length, danger: overdueRequests.length > 0 },
          { label: "Completed (3mo)", value: stats.completed },
          { label: "Rejected (3mo)", value: stats.rejected },
        ].map(({ label, value, danger }) => (
          <Card key={label} className={danger ? "border-destructive" : ""}>
            <CardContent className="pt-4 pb-3">
              <p className={`text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.avg_resolution_days != null && (
        <p className="text-sm text-muted-foreground">
          Average resolution time (3 months):{" "}
          <span className={stats.avg_resolution_days > 25 ? "text-amber-600 font-medium" : "font-medium"}>
            {stats.avg_resolution_days} days
          </span>{" "}
          <span className="text-xs">(POPIA SLA: 30 days)</span>
        </p>
      )}

      {/* Retention purge status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Retention purge</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last run</span>
            <span className="flex items-center gap-1">
              {lastPurge?.status === "completed" && (
                <CheckCircle2 className="size-3.5 text-green-600" />
              )}
              {lastPurge?.status === "failed" && (
                <AlertTriangle className="size-3.5 text-destructive" />
              )}
              {lastPurgeDate}
            </span>
          </div>
          {lastPurge?.status === "failed" && (
            <div className="p-2 rounded bg-destructive/10 text-xs text-destructive">
              Purge failed. Check Sentry for details.
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            The retention purge runs daily and automatically deletes time-eligible records per
            POPIA s17 minimisation principle. Consent log records are never purged.
          </p>
        </CardContent>
      </Card>

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/settings/privacy/data-subject-requests">
            <ShieldCheck className="size-4 mr-2" />
            Request inbox
          </Link>
        </ActionButton>
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/settings/privacy/retention">
            Retention policies
          </Link>
        </ActionButton>
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/settings/privacy/information-officer">
            Information Officer
          </Link>
        </ActionButton>
      </div>
    </div>
  )
}
