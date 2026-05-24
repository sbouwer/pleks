/**
 * app/api/screening/[id]/fitscore-pdf/route.ts — Stream 2 FitScore PDF download for agent use
 *
 * Auth:   agent workspace (gateway — org scoped)
 * Data:   reads applications + application_co_applicants + organisations
 * Notes:  Routes to agent_single (co-applicants == 0) or agent_multi (co-applicants >= 1).
 *         LDP is a state branch within whichever template the lease shape selects.
 *         Uses assembleReportData (shared with dashboard) for Tribunal-match parity.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7.
 */
import { renderToBuffer } from "@react-pdf/renderer"
import type { DocumentProps } from "@react-pdf/renderer"
import { createElement } from "react"
import type { ReactElement } from "react"
import { gateway } from "@/lib/supabase/gateway"
import { assembleReportData } from "@/lib/screening/assembleReportData"
import { AgentSingleReport } from "@/lib/reports/screening/agent_single"
import { AgentMultiReport } from "@/lib/reports/screening/agent_multi"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"

export const dynamic = "force-dynamic"

function selectTemplate(data: FitScoreReportData, coCount: number): ReactElement<DocumentProps> {
  if (coCount > 0) return createElement(AgentMultiReport, { data }) as unknown as ReactElement<DocumentProps>
  return createElement(AgentSingleReport, { data }) as unknown as ReactElement<DocumentProps>
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gw = await gateway()
  if (!gw) return new Response('Unauthorized', { status: 401 })
  const { db, orgId } = gw
  const { id } = await params

  const { data: app, error: appErr } = await db
    .from('applications')
    .select(`
      id, org_id, first_name, last_name,
      applicant_nationality_type, is_foreign_national,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count,
      fitscore, fitscore_band, fitscore_confidence_index,
      fitscore_verification_integrity, fitscore_material_flags,
      fitscore_components, fitscore_component_snapshot,
      fitscore_computed_at, fitscore_engine_version,
      fitscore_narrative_prompt_version, fitscore_interpretation_version,
      fitscore_synthesis_template_version,
      fitscore_narrative, fitscore_inputs_hash,
      listings(asking_rent_cents, units(unit_number, properties(name)))
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (appErr || !app) return new Response('Not found', { status: 404 })
  if (!app.fitscore_band) return new Response('FitScore not yet computed', { status: 422 })

  const { data: coApplicants } = await db
    .from('application_co_applicants')
    .select(`
      id, id_type, first_name, last_name, co_applicant_index,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count
    `)
    .eq('primary_application_id', id)
    .order('co_applicant_index', { ascending: true })

  const { data: orgRow } = await db
    .from('organisations')
    .select('name')
    .eq('id', orgId)
    .single()

  const data = assembleReportData(app, coApplicants ?? [], orgRow?.name ?? 'Pleks')
  if (!data) return new Response('Incomplete FitScore data', { status: 422 })

  let buffer: Buffer
  try {
    buffer = await renderToBuffer(selectTemplate(data, data.coApplicantCount))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    console.error('[fitscore-pdf] renderToBuffer failed:', e.message)
    return new Response('PDF generation failed', { status: 500 })
  }

  const filename = `Pleks-FitScore-${app.id.slice(0, 8)}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
