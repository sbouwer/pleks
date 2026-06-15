/**
 * app/api/cron/screening-artefact-purge/route.ts — F-3: daily 90-day declined-applicant PII purge
 *
 * Route:  GET /api/cron/screening-artefact-purge
 * Auth:   x-cron-secret header (CRON_SECRET) — crons fire regardless of subscription state, so NO
 *         requireAgentWriteAccess; service client only.
 * Data:   applications (+ screening_artifacts, application_screening_lines,
 *         application_bank_statement_classifications, application_prescreens) via
 *         lib/popia/screeningArtefactPurge.ts. IRREVERSIBLE deletes — guarded per row (terminal + ≥90d +
 *         not-converted + not-already-purged).
 * Notes:  Wired into app/api/cron/daily/route.ts (Hobby plan — no extra vercel.json entry).
 *         SINGLE 90-day declined-applicant tier (ADDENDUM_70H F3): nulls ALL declined PII (identity +
 *         financial + screening artefacts), deletes the screening-artefact tables, and removes
 *         identity-docs/bank-statements/screening-reports Storage. Folds in (and replaces) the retired
 *         lib/rules/application/rejected-applicant-purge.ts OrgRule. pii_purged_at is the idempotency marker.
 *         Pass ?dry_run=1 to COUNT eligible applications per org without deleting (review aid).
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { purgeScreeningArtefactsForOrg } from "@/lib/popia/screeningArtefactPurge"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1"
  const db = await createServiceClient()
  const now = new Date()

  const { data: orgs, error: orgsErr } = await db
    .from("organisations")
    .select("id")
    .is("deleted_at", null)

  if (orgsErr || !orgs) {
    Sentry.captureException(orgsErr, { tags: { cron: "screening-artefact-purge" } })
    return NextResponse.json({ error: "Failed to load orgs" }, { status: 500 })
  }

  let purged = 0
  let evaluated = 0
  const errors: string[] = []

  for (const org of orgs) {
    try {
      const r = await purgeScreeningArtefactsForOrg(db, org.id, now, { dryRun })
      purged += r.purged
      evaluated += r.evaluated
      if (r.errors.length > 0) errors.push(...r.errors.map((e) => `org ${org.id}: ${e}`))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`org ${org.id}: ${msg}`)
      Sentry.captureException(err, { tags: { cron: "screening-artefact-purge", org_id: org.id } })
    }
  }

  if (process.env.HEARTBEAT_SCREENING_ARTEFACT_PURGE) {
    await fetch(process.env.HEARTBEAT_SCREENING_ARTEFACT_PURGE, { method: "GET" }).catch(() => {})
  }

  const ok = errors.length === 0
  return NextResponse.json(
    { ok, dry_run: dryRun, evaluated, purged, errors },
    { status: ok ? 200 : 500 },
  )
}
