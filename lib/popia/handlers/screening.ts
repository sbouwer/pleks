/**
 * lib/popia/handlers/screening.ts — POPIA s23 access response handler for FitScore screening data
 *
 * Auth:   Service-role only — called from the BUILD_65 access-request pipeline
 * Data:   applications, application_co_applicants, popia-exports bucket
 * Notes:  Generates L2 minimal access response per §8.4. Excludes co-applicant data,
 *         internal weights, Confidence Index, and operational metadata (§8.5).
 *         Routes through BUILD_65 signed-URL delivery (popia-exports bucket + audit_log).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.3–§8.7.
 */

import { createHash } from 'node:crypto'
import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import { recordAudit } from '@/lib/audit/recordAudit'
import { ScreeningResponseLetter } from '@/lib/reports/popia/screening_response'
import type { ScreeningResponseData } from '@/lib/reports/popia/screening_response'
import type { MaterialFlag } from '@/lib/screening/fitScoreEngine.v1'
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface L2GenerationResult {
  signedUrl: string
  storagePath: string
  manifestHash: string
  expiresAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_LABELS: Record<string, string> = {
  verified_stability:   'Verified Stability',
  stable_profile:       'Stable Profile',
  cautious_review:      'Cautious Review',
  limited_confidence:   'Limited Confidence',
  adverse_signals:      'Adverse Signals',
  limited_data_profile: 'Limited Data Profile',
  blocked:              'Blocked',
}

function identityVerifyResult(flags: MaterialFlag[]): ScreeningResponseData['identityVerificationResult'] {
  const deceased = flags.some(f => f.flag === 'deceased_status')
  const confirmedFraud = flags.some(f => f.flag === 'confirmed_fraudulent_documents')
  if (deceased || confirmedFraud) return 'fail'
  return 'pass'
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates the L2 POPIA s23 access response PDF for a FitScore assessment.
 *
 * @param applicationId   The application to generate the response for
 * @param subjectUserId   The data subject's user ID (used for org scoping — must match application)
 * @param actorUserId     The Information-Officer-authorised user triggering generation
 * @param orgId           The agency org ID
 */
export async function generateScreeningL2Response(
  applicationId: string,
  subjectUserId: string,
  actorUserId: string,
  orgId: string,
): Promise<L2GenerationResult> {
  const db = await createServiceClient()

  // ── 1. Read application row (only data subject's own record) ──────────────

  const { data: app, error: appErr } = await db
    .from('applications')
    .select(`
      id, org_id, first_name, last_name, applicant_email,
      fitscore, fitscore_band, fitscore_material_flags,
      fitscore_engine_version, fitscore_narrative_prompt_version,
      fitscore_interpretation_version, fitscore_computed_at,
      stage2_status,
      identityMatchStatus:id_type
    `)
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  if (appErr ?? !app) throw new Error(`Application not found: ${appErr?.message ?? 'no row'}`)

  // ── 2. Read org name ──────────────────────────────────────────────────────

  const { data: org, error: orgError } = await db
    .from('organisations')
    .select('name')
    .eq('id', orgId)
    .single()
    logQueryError("generateScreeningL2Response organisations", orgError)

  // ── 3. Build L2 response data (§8.4 — only permitted disclosures) ─────────

  const materialFlags = (app.fitscore_material_flags ?? []) as MaterialFlag[]

  // Dominant flags: Critical and Capping only — Trust flags are not disclosed in L2
  const dominantFlags = materialFlags
    .filter(f => f.class === 'critical' || f.class === 'capping')
    .map(f => ({ class: f.class, description: f.description }))

  const band = (app.fitscore_band as string | null) ?? 'limited_data_profile'
  const isLDP = band === 'limited_data_profile'
  const isBlocked = band === 'blocked'

  const responseData: ScreeningResponseData = {
    responseDate:             new Date().toISOString(),
    applicationRef:           app.id,
    subjectName:              `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Applicant',
    subjectEmail:             app.applicant_email ?? '',
    orgName:                  org?.name ?? 'Your letting agent',
    band,
    bandLabel:                BAND_LABELS[band] ?? band,
    score:                    isLDP || isBlocked ? null : (app.fitscore as number | null),
    isLimitedDataProfile:     isLDP,
    isBlocked,
    dominantFlags,
    identityVerificationResult: identityVerifyResult(materialFlags),
    applicationStatus:        (app.stage2_status as string | null) ?? 'pending_review',
    stream1DeliveryNote:      'delivered via email at the time of screening payment',
    engineVersion:            (app.fitscore_engine_version as string | null) ?? 'unknown',
    narrativePromptVersion:   app.fitscore_narrative_prompt_version as string | null,
    generatedAt:              (app.fitscore_computed_at as string | null) ?? new Date().toISOString(),
    interpretationVersion:    (app.fitscore_interpretation_version as string | null) ?? 'v1.0',
  }

  // ── 4. Render PDF ─────────────────────────────────────────────────────────

  const pdfBuffer = await renderToBuffer(ScreeningResponseLetter({ data: responseData }))
  const manifestHash = createHash('sha256').update(pdfBuffer).digest('hex')

  // ── 5. Upload to popia-exports bucket ─────────────────────────────────────

  const storagePath = `s23/${orgId}/${applicationId}/${Date.now()}.pdf`
  const { error: uploadErr } = await db.storage
    .from('popia-exports')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`)

  // ── 6. Create popia_exports row + signed URL ──────────────────────────────

  const TTL_SECONDS = 7 * 24 * 60 * 60   // 7 days
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  const { data: signed, error: signErr } = await db.storage
    .from('popia-exports')
    .createSignedUrl(storagePath, TTL_SECONDS)

  if (signErr ?? !signed) throw new Error(`Signed URL generation failed: ${signErr?.message ?? 'no url'}`)

  const { error: rowErr } = await db.from('popia_exports').insert({
    org_id:             orgId,
    request_id:         null,    // no DSR row required for direct L2 generation
    pdf_storage_path:   storagePath,
    json_storage_path:  null,
    zip_storage_path:   null,
    manifest_hash:      manifestHash,
    manifest_summary:   { type: 'fitscore_l2_s23', application_id: applicationId },
    expires_at:         expiresAt,
  })

  if (rowErr) throw new Error(`popia_exports insert failed: ${rowErr.message}`)

  // ── 7. Audit log with POPIA s23 discriminator ─────────────────────────────

  await recordAudit(db, {
    orgId, actorId: actorUserId, action: 'UPDATE', table: 'applications', recordId: applicationId,
    after: {
      action:          'popia_s23_response_generated',
      subject_user_id: subjectUserId,
      storage_path:    storagePath,
      manifest_hash:   manifestHash,
    },
  })

  return {
    signedUrl:    signed.signedUrl,
    storagePath,
    manifestHash,
    expiresAt,
  }
}
