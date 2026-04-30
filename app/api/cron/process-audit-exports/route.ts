/**
 * app/api/cron/process-audit-exports/route.ts — Processes queued audit CSV export jobs
 *
 * Route:  GET /api/cron/process-audit-exports
 * Auth:   x-cron-secret header (CRON_SECRET env var)
 * Notes:  Runs every 2 minutes via Vercel Cron. Processes up to 3 jobs per invocation.
 *         Uploads CSV to Supabase Storage, updates job record with signed URL (7-day TTL).
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { streamAuditCsv, type ExportFilterParams } from "@/lib/admin/csv-export"

const MAX_PER_RUN = 3
const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days in seconds

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 })
  }

  const db = await createServiceClient()

  // Pick up queued jobs (also retry stuck processing jobs older than 10 min)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: jobs, error: fetchErr } = await db
    .from("audit_exports")
    .select("id, requested_by, filter_params")
    .or(`status.eq.queued,and(status.eq.processing,started_at.lt.${tenMinAgo})`)
    .order("created_at")
    .limit(MAX_PER_RUN)

  if (fetchErr) {
    console.error("[process-audit-exports] fetch failed:", fetchErr.message)
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 })
  }

  const results: { id: string; status: string }[] = []

  for (const job of jobs ?? []) {
    const jobId = job.id as string

    // Mark processing
    await db.from("audit_exports").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", jobId)

    try {
      const filterParams = (job.filter_params as ExportFilterParams) ?? {}
      const { csvContent, rowCount } = await streamAuditCsv(jobId, filterParams)

      const fileName = `audit-exports/${jobId}.csv`
      const blob = new Blob([csvContent], { type: "text/csv" })

      const { error: uploadErr } = await db.storage
        .from("admin-exports")
        .upload(fileName, blob, { contentType: "text/csv", upsert: true })

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

      const { data: signedData, error: signErr } = await db.storage
        .from("admin-exports")
        .createSignedUrl(fileName, SIGNED_URL_TTL)

      if (signErr) throw new Error(`Signed URL failed: ${signErr.message}`)

      await db.from("audit_exports").update({
        status:       "completed",
        row_count:    rowCount,
        file_path:    fileName,
        signed_url:   signedData.signedUrl,
        completed_at: new Date().toISOString(),
        expires_at:   new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString(),
      }).eq("id", jobId)

      results.push({ id: jobId, status: "completed" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[process-audit-exports] job ${jobId} failed:`, msg)
      await db.from("audit_exports").update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", jobId)
      results.push({ id: jobId, status: "failed" })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
