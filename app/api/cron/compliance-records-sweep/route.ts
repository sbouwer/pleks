/**
 * app/api/cron/compliance-records-sweep/route.ts — F3 5-year compliance-records sweep
 *
 * Route:  GET /api/cron/compliance-records-sweep
 * Auth:   x-cron-secret header (CRON_SECRET) — service client; fires regardless of subscription state.
 * Data:   applications (Tier-2 decision-accountability columns) + consent_verifications (contact PII)
 *         via lib/popia/complianceRecordsSweep.ts. Hold-gated (claimApplicantPurgeSlot), idempotent.
 * Notes:  Wired into app/api/cron/daily/route.ts (Hobby plan — no extra vercel.json entry). The 5-YEAR
 *         tier of the F3 two-tier model; the 90-day tier is screening-artefact-purge. Strips the
 *         decision-accountability record (declined_decision_record) and the consent contact-PII
 *         (consent_proof) once their 5y windows pass. Global single pass (org_id audited per row).
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { complianceRecordsSweep } from "@/lib/popia/complianceRecordsSweep"
import { requireCronAuth } from "@/lib/cron/auth"
import { optionalEnv } from "@/lib/env"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const db = await createServiceClient()
  try {
    const r = await complianceRecordsSweep(db)
    const errors = [...r.declined_decision_record.errors, ...r.consent_proof.errors]

    if (optionalEnv("HEARTBEAT_COMPLIANCE_RECORDS_SWEEP")) {
      await fetch(optionalEnv("HEARTBEAT_COMPLIANCE_RECORDS_SWEEP"), { method: "GET" }).catch(() => {})
    }

    const ok = errors.length === 0
    return NextResponse.json({ ok, ...r }, { status: ok ? 200 : 500 })
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "compliance-records-sweep" } })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
