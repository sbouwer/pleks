/**
 * lib/legal/archive.ts — Daily legal version archiver: snapshots /terms and /privacy HTML to Storage
 *
 * Auth:   Called by the daily cron orchestrator (no external auth needed)
 * Data:   legal-archive Storage bucket; reads LEGAL_VERSIONS constants
 * Notes:  Idempotent — skips upload if the versioned file already exists in Storage.
 *         Legal pages live on pleks.co.za (apex) — LEGAL_SITE_URL must point there in production.
 *         audit_log intentionally omitted: org_id NOT NULL prevents system-level entries.
 *         Caller stores the returned result in cron_runs.metadata for observability.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { APP_URL } from "@/lib/env"

// Legal pages live on pleks.co.za, not app.pleks.co.za — LEGAL_SITE_URL must be set in prod
const LEGAL_SITE_URL = process.env.LEGAL_SITE_URL ?? APP_URL

const DOCS = [
  { type: "terms",   version: LEGAL_VERSIONS.terms,   path: "/terms" },
  { type: "privacy", version: LEGAL_VERSIONS.privacy, path: "/privacy" },
] as const

type DocOutcome = "archived" | "skipped" | "fetch_failed" | "upload_failed"

export type LegalArchiveResult = Record<string, { version: string; outcome: DocOutcome }>

export async function runLegalArchiveStep(
  supabase: SupabaseClient,
  ctx: { triggeredAt: Date },
): Promise<LegalArchiveResult> {
  const result: LegalArchiveResult = {}

  for (const { type, version, path } of DOCS) {
    const { data: existing, error: existingError } = await supabase.storage
      .from("legal-archive")
      .list(type, { search: `${version}.html` })
    logQueryError("runLegalArchiveStep legal-archive", existingError)

    if (existing?.length) {
      result[type] = { version, outcome: "skipped" }
      continue
    }

    let html: string
    try {
      const res = await fetch(`${LEGAL_SITE_URL}${path}`, {
        headers: { "User-Agent": "pleks-legal-archiver/1.0" },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (err) {
      console.error(`[legal-archive] fetch failed for ${type}/${version}.html:`, err instanceof Error ? err.message : err)
      result[type] = { version, outcome: "fetch_failed" }
      continue
    }

    const { error: uploadErr } = await supabase.storage
      .from("legal-archive")
      .upload(`${type}/${version}.html`, new Blob([html], { type: "text/html; charset=utf-8" }), {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      })

    if (uploadErr) {
      console.error(`[legal-archive] upload failed for ${type}/${version}.html:`, uploadErr.message)
      result[type] = { version, outcome: "upload_failed" }
    } else {
      console.log(`[legal-archive] archived ${type}/${version}.html at ${ctx.triggeredAt.toISOString()}`)
      result[type] = { version, outcome: "archived" }
    }
  }

  return result
}
