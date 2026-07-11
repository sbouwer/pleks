/**
 * app/(admin)/admin/popia-requests/_components/ReplayReportView.tsx — FitScore replay report renderer
 *
 * Auth:   Rendered server-side inside the admin replay route (requireAdminAuth gate)
 * Data:   Accepts ReplayReport from runFitScoreReplay — no further DB access
 * Notes:  Displays integrity status, band comparison, dimension comparison table, and mismatch list.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.8–§8.12.
 */

import { SA_TIMEZONE } from "@/lib/dates"
import type { ReplayReport } from '@/lib/screening/fitScoreReplay'
import { DIMENSION_MATCH_EPSILON } from '@/lib/screening/fitScoreReplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  report: ReplayReport
}

const STATUS_STYLES: Record<string, string> = {
  match:            'bg-green-100 text-green-800 border-green-200',
  mismatch:         'bg-red-100 text-red-800 border-red-200',
  incomplete_data:  'bg-amber-100 text-amber-800 border-amber-200',
}

const STATUS_LABELS: Record<string, string> = {
  match:            'Match',
  mismatch:         'Mismatch',
  incomplete_data:  'Incomplete data',
}

const DIMENSION_LABELS: Record<string, string> = {
  affordability:          'Affordability',
  stability:              'Stability',
  creditBehaviour:        'Credit behaviour',
  verificationIntegrity:  'Verification integrity',
}

export function ReplayReportView({ report }: Readonly<Props>) {
  const statusStyle = STATUS_STYLES[report.integrityStatus] ?? STATUS_STYLES.incomplete_data
  const statusLabel = STATUS_LABELS[report.integrityStatus] ?? report.integrityStatus

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-mono">
                {report.applicationId}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Generated {new Date(report.generatedAt).toLocaleString('en-ZA', { timeZone: SA_TIMEZONE })}
                {report.computedAt && (
                  <> · Score computed {new Date(report.computedAt).toLocaleString('en-ZA', { timeZone: SA_TIMEZONE })}</>
                )}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded border ${statusStyle}`}>
              {statusLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Engine version (stored)</span>
            <span className="font-mono text-xs">{report.engineVersionStored}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Engine version (current)</span>
            <span className="font-mono text-xs">{report.engineVersionCurrent}</span>
          </div>
          {report.narrativePromptVersion && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Narrative prompt</span>
              <span className="font-mono text-xs">{report.narrativePromptVersion}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Band comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Band comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stored band</span>
            <span className="font-mono text-xs">{report.bandStored ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Band from snapshot</span>
            <span className="font-mono text-xs">{report.bandFromSnapshot ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Match</span>
            <span className={report.bandMatch ? 'text-green-700' : 'text-red-700 font-medium'}>
              {report.bandMatch ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Inputs hash recorded</span>
            <span className={report.inputsHashVerified ? 'text-green-700' : 'text-amber-700'}>
              {report.inputsHashVerified ? 'Yes' : 'No'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Dimension comparison */}
      {report.dimensionComparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dimension scores</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">Dimension</th>
                  <th className="text-right pb-2">Stored</th>
                  <th className="text-right pb-2">Snapshot</th>
                  <th className="text-right pb-2">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {((['affordability', 'stability', 'creditBehaviour', 'verificationIntegrity'] as const)).map(key => {
                  const stored = report.dimensionComparison!.stored[key]
                  const fromSnap = report.dimensionComparison!.fromSnapshot[key]
                  const matches = Math.abs(stored - fromSnap) < DIMENSION_MATCH_EPSILON
                  return (
                    <tr key={key}>
                      <td className="py-1.5 text-muted-foreground">{DIMENSION_LABELS[key]}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{stored.toFixed(3)}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{fromSnap.toFixed(3)}</td>
                      <td className={`py-1.5 text-right text-xs ${matches ? 'text-green-700' : 'text-red-700 font-medium'}`}>
                        {matches ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Mismatch list */}
      {report.mismatches.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-800">Mismatches ({report.mismatches.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {report.mismatches.map((m, i) => (
                <li key={i} className="text-red-700 text-xs leading-relaxed">
                  {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Incomplete data notice */}
      {report.integrityStatus === 'incomplete_data' && (
        <div className="p-3 border rounded-md bg-amber-50 border-amber-200 text-sm text-amber-900">
          <p className="font-medium">Incomplete data — replay cannot be performed</p>
          <p className="mt-1 text-xs">
            The component snapshot was not stored for this application. This occurs when the
            application was scored before snapshot storage was introduced. No integrity
            conclusion can be drawn.
          </p>
        </div>
      )}
    </div>
  )
}
