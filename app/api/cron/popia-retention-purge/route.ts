/**
 * app/api/cron/popia-retention-purge/route.ts — Daily POPIA retention-policy purge
 *
 * Route:  GET /api/cron/popia-retention-purge
 * Auth:   x-cron-secret header
 * Data:   retention_purge_runs (INSERT/UPDATE), retention_policies_snapshot (SELECT),
 *         then per-category: applications, communication_log, etc. via lib/popia/erasure.ts
 * Notes:  D-POPIA-02: executes retention-policy deletions per platform defaults.
 *         Wired into app/api/cron/daily/route.ts (Hobby plan — no extra vercel.json entry).
 *         isErasableNow() is called per row — no inline retention logic here (D-POPIA-06).
 *         Purge never touches consent_log (immutable) or closed trust_reconciliation_periods (BUILD_64).
 *         One retention_purge_runs row per org per run (§5.6) — all category counts rolled up inside.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { isErasableNow, type DataCategory } from "@/lib/popia/retention"
import type { SupabaseClient } from "@supabase/supabase-js"

type CatResult = { evaluated: number; deleted: number; skipped_carveout: number }
type CatSummary = { orgs_processed: number; deleted: number; skipped: number; errors: string[] }

const PURGE_CATEGORIES: DataCategory[] = [
  "rejected_applications",
  "maintenance_records",
  // communications, inspection_photos, lease_documents added progressively
  // as the per-table delete helpers mature (Phase 7 wires full cascade)
]

// ─── Per-category purge helpers (pure — no retention_purge_runs writes) ───────

async function purgeRejectedApplications(
  db: SupabaseClient,
  orgId: string,
  now: Date,
): Promise<CatResult> {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 12)
  const result: CatResult = { evaluated: 0, deleted: 0, skipped_carveout: 0 }

  const { data: rows } = await db
    .from("applications")
    .select("id, created_at")
    .eq("org_id", orgId)
    .in("status", ["rejected", "withdrawn"])
    .lt("decided_at", cutoff.toISOString())

  for (const row of rows ?? []) {
    result.evaluated++
    const decision = await isErasableNow("rejected_applications", {
      orgId,
      created_at: new Date(row.created_at),
    })
    if ("erasable" in decision && decision.erasable) {
      await db.from("applications").delete().eq("id", row.id)
      await db.from("audit_log").insert({
        event_type: "retention_purge",
        table_name: "applications",
        record_id: row.id,
        values: { category: "rejected_applications" },
      })
      result.deleted++
    } else {
      result.skipped_carveout++
    }
  }

  return result
}

// ─── Per-org orchestrator (one retention_purge_runs row per org) ──────────────

async function runForOrg(
  db: SupabaseClient,
  orgId: string,
  now: Date,
  summary: Record<string, CatSummary>,
): Promise<void> {
  const { data: runRow } = await db
    .from("retention_purge_runs")
    .insert({ org_id: orgId, status: "running", records_by_category: {} })
    .select("id")
    .single()
  const runId = runRow?.id

  const aggregated: Record<string, CatResult> = {}
  const errors: Array<{ category: string; error: string }> = []

  for (const category of PURGE_CATEGORIES) {
    try {
      let catResult: CatResult = { evaluated: 0, deleted: 0, skipped_carveout: 0 }

      if (category === "rejected_applications") {
        catResult = await purgeRejectedApplications(db, orgId, now)
      }
      // future categories appended here as helpers land

      aggregated[category] = catResult
      summary[category].orgs_processed++
      summary[category].deleted += catResult.deleted
      summary[category].skipped += catResult.skipped_carveout
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ category, error: msg })
      summary[category].errors.push(`org ${orgId}: ${msg}`)
      Sentry.captureException(err, { tags: { cron: "popia-retention-purge", org_id: orgId, category } })
    }
  }

  if (runId) {
    await db.from("retention_purge_runs")
      .update({
        status: errors.length > 0 ? "failed" : "completed",
        run_completed_at: new Date().toISOString(),
        records_by_category: aggregated,
        errors: errors.length > 0 ? errors : [],
      })
      .eq("id", runId)
  }
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = await createServiceClient()
  const now = new Date()
  const summary: Record<string, CatSummary> = {}

  for (const category of PURGE_CATEGORIES) {
    summary[category] = { orgs_processed: 0, deleted: 0, skipped: 0, errors: [] }
  }

  const { data: orgs, error: orgsErr } = await db
    .from("organisations")
    .select("id")
    .is("deleted_at", null)
    .neq("subscription_status", "purged")

  if (orgsErr || !orgs) {
    Sentry.captureException(orgsErr, { tags: { cron: "popia-retention-purge" } })
    return NextResponse.json({ error: "Failed to load orgs" }, { status: 500 })
  }

  for (const org of orgs) {
    await runForOrg(db, org.id, now, summary)
  }

  if (process.env.HEARTBEAT_POPIA_RETENTION_PURGE) {
    await fetch(process.env.HEARTBEAT_POPIA_RETENTION_PURGE, { method: "GET" }).catch(() => {})
  }

  return NextResponse.json({ ok: true, summary })
}
