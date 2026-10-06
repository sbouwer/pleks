/**
 * lib/screening/resultView.ts — what a party sees when it opens its N6 result link, after every open-time check
 *
 * Auth:   the signed token (lib/screening/resultLink.ts) names the application and the subject; nothing else is trusted
 *         from the request. The org is DISCOVERED from the application row, never supplied.
 * Data:   applications (FitScore columns, purge-eligibility columns), the 14X roster (milestoneNotices.readRoster),
 *         consent_log (via groupClauseShownFor); writes one audit_log NOTE per successful open
 * Notes:  Stéan 2026-10-05: open-time re-check (application exists, group_clause_shown on this subject), expiry = the
 *         application's purge date, a trail row per open.
 *         · Expiry: a link dies when the application is deleted, already purged (pii_purged_at) OR purge-eligible now
 *           (isScreeningArtefactPurgeable — the same guard the purge itself uses, so the link can never outlive the day
 *           the sweep could strip it, even if the sweep has not yet run).
 *         · The "trail row" is an audit_log NOTE, not a screening_notification_events row: that table's milestone and
 *           channel CHECKs model SEND attempts, so an open there needs DDL no spec names (Decided in build, 14X P5).
 *           Fail closed: when the NOTE cannot be written, nothing is shown — an unrecorded open is the thing the
 *           ruling forbids.
 *         · Shows ONLY the consolidated assessment: score, band, the completed parties' names, N of M, and the closing
 *           sentence. Never the per-party snapshot, the components, the material flags or ANY narrative field — those
 *           carry one party's data and the policy (v1.5.1 §03) says an individual result is never disclosed to another
 *           party. That includes the affordability evidence line, though it reads as joint: it states ratios over JOINT
 *           income and combined instalments ("Rent 23% of joint income; debt servicing 17%"), so a party who knows its
 *           own figures recovers the other party's verified income and bureau debt by subtraction (walker 14x-p5 F1).
 *           Withheld until counsel reads it — the register text naming it is COUNSEL-PENDING.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAuditReturningId } from "@/lib/audit/recordAudit"
import { isScreeningArtefactPurgeable } from "@/lib/popia/screeningArtefactPurge"
import { readAssessedWith } from "@/lib/screening/assessedWith"
import { ASSESSMENT_CLOSING_SENTENCE } from "@/lib/screening/assessmentWording"
import { BAND_LABELS } from "@/lib/screening/bandLabels"
import type { FitScoreBand } from "@/lib/screening/fitScoreEngine.v1"
import { readRoster } from "@/lib/screening/milestoneNotices"
import { groupClauseShownFor, verifyResultToken } from "@/lib/screening/resultLink"

export interface ResultView {
  firstName: string
  propertyLabel: string
  score: number | null
  bandLabel: string | null
  completedNames: string[]
  completed: number
  total: number
  closingSentence: string
}

/** `invalid` — the token is not ours. `gone` — it was, but the application or this party's view of it no longer is. */
export type ResultViewOutcome = { status: "ok"; view: ResultView } | { status: "gone" } | { status: "invalid" }

// One literal (not a concatenation) so the client can type the row. No narrative column: nothing in it may be shown.
const APPLICATION_SELECT =
  "id, org_id, deleted_at, stage1_status, stage2_status, tenant_id, reviewed_at, prescreened_at, updated_at, pii_purged_at, fitscore, fitscore_band, fitscore_component_snapshot"

export async function loadResultView(
  db: SupabaseClient, token: string, now: Date, context?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ResultViewOutcome> {
  const claim = verifyResultToken(token, now)
  if (!claim) return { status: "invalid" }
  const { applicationId, subject } = claim

  // org scope: the org is DISCOVERED here, not checked against: the signed token names only the application, and every later read is bound to the org this row carries.
  const { data: app, error } = await db.from("applications").select(APPLICATION_SELECT).eq("id", applicationId).maybeSingle()
  if (error) throw new Error(`result view: read application: ${error.message}`)
  if (!app || app.deleted_at || app.pii_purged_at) return { status: "gone" }
  const orgId = app.org_id as string
  if (isScreeningArtefactPurgeable({
    id: app.id as string, org_id: orgId, stage1_status: app.stage1_status as string | null,
    stage2_status: app.stage2_status as string | null, tenant_id: app.tenant_id as string | null,
    reviewed_at: app.reviewed_at as string | null, prescreened_at: app.prescreened_at as string | null,
    updated_at: app.updated_at as string | null, pii_purged_at: null,
  }, now)) return { status: "gone" }

  const stamp = readAssessedWith(app.fitscore_component_snapshot ?? null)
  if (!stamp || !stamp.completedSubjectIds.includes(subject.subjectId)) return { status: "gone" }
  if (!(await groupClauseShownFor(db, orgId, applicationId, subject))) return { status: "gone" }

  const roster = await readRoster(db, orgId, applicationId)
  if (!roster) return { status: "gone" }
  const scored = new Set(stamp.completedSubjectIds)
  const completedParties = roster.parties.filter((x) => scored.has(x.subject.subjectId) && x.complete)
  const me = completedParties.find((x) => x.subject.subjectType === subject.subjectType && x.subject.subjectId === subject.subjectId)
  if (!me) return { status: "gone" }

  const trail = await recordAuditReturningId(db, {
    orgId, action: "NOTE", table: "applications", recordId: applicationId,
    after: { action: "screening_result_opened", subject_type: subject.subjectType, subject_id: subject.subjectId },
    context,
  })
  if (!trail) throw new Error("result view: the open could not be recorded")

  const band = app.fitscore_band as FitScoreBand | null
  return {
    status: "ok",
    view: {
      firstName: me.firstName, propertyLabel: roster.propertyLabel,
      score: (app.fitscore as number | null) ?? null,
      bandLabel: band ? BAND_LABELS[band] ?? null : null,
      completedNames: completedParties.map((x) => x.name),
      completed: stamp.n, total: stamp.m, closingSentence: ASSESSMENT_CLOSING_SENTENCE,
    },
  }
}
