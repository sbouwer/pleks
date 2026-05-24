/**
 * app/(admin)/admin/popia-requests/[applicationId]/page.tsx — FitScore replay detail view
 *
 * Route:  /admin/popia-requests/[applicationId]
 * Auth:   requireAdminAuth — platform-admin HMAC token gate
 * Data:   applications (org_id lookup) + runFitScoreReplay (integrity verification)
 * Notes:  Reads application org_id via service client, then runs replay against that org.
 *         Replay result rendered by ReplayReportView. No agent-facing route.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.8–§8.12.
 */
import { notFound } from 'next/navigation'
import { requireAdminAuth } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { runFitScoreReplay } from '@/lib/screening/fitScoreReplay'
import { ReplayReportView } from '../_components/ReplayReportView'
import { BackLink } from '@/components/ui/BackLink'

export default async function AdminFitScoreReplayPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  await requireAdminAuth()
  const { applicationId } = await params

  const db = await createServiceClient()

  // Resolve org_id — service-role client, no org filter required
  const { data: app, error: appErr } = await db
    .from('applications')
    .select('id, org_id')
    .eq('id', applicationId)
    .single()

  if (appErr) {
    console.error('AdminFitScoreReplayPage: application lookup failed:', appErr.message)
    notFound()
  }
  if (!app) notFound()

  const report = await runFitScoreReplay(applicationId, app.org_id as string)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <BackLink href="/admin/popia-requests" label="POPIA requests" />

      <div>
        <h1 className="text-2xl font-semibold">FitScore integrity replay</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verifies that stored FitScore columns are consistent with the component snapshot
          written at score time. Detects post-hoc mutation.
        </p>
      </div>

      <ReplayReportView report={report} />
    </div>
  )
}
