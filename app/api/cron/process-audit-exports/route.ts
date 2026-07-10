/**
 * app/api/cron/process-audit-exports/route.ts — Processes queued audit CSV export jobs
 *
 * Route:  GET /api/cron/process-audit-exports
 * Auth:   x-cron-secret header (CRON_SECRET env var)
 * Notes:  Called from the daily orchestrator (05:00 UTC) — not a standalone Vercel cron
 *         (Hobby plan supports daily crons only; process-audit-exports is wired as a step
 *         in /api/cron/daily). Processes up to 3 queued jobs per invocation.
 *         Uploads CSV to Supabase Storage, updates job record with signed URL (7-day TTL).
 *         Sends Resend email to ADMIN_EMAIL when complete (no-op if RESEND_API_KEY unset).
 */
import { NextRequest, NextResponse } from "next/server"
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"
import { render } from "@react-email/components"
import { createServiceClient } from "@/lib/supabase/server"
import { streamAuditCsv, type ExportFilterParams } from "@/lib/admin/csv-export"
import { AuditExportReadyEmail } from "@/lib/comms/templates/admin/audit-export-ready"
import { requireCronAuth } from "@/lib/cron/auth"

const MAX_PER_RUN   = 3
const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days in seconds

type Db = Awaited<ReturnType<typeof createServiceClient>>

function buildFilterSummary(fp: ExportFilterParams): string {
  const parts: string[] = []
  if (fp.startDate)         parts.push(`from ${fp.startDate}`)
  if (fp.endDate)           parts.push(`to ${fp.endDate}`)
  if (fp.action?.length)    parts.push(fp.action.join("/"))
  if (fp.tableName?.length) parts.push(`${fp.tableName.length} table(s)`)
  return parts.join(" · ") || "all entries (last 7 days)"
}

async function sendExportEmail(jobId: string, db: Db, signedUrl: string, rowCount: number, fp: ExportFilterParams): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!process.env.RESEND_API_KEY || !adminEmail) return

  const html = await render(
    AuditExportReadyEmail({
      branding:      { orgName: "Pleks Platform" },
      downloadUrl:   signedUrl,
      rowCount,
      filterSummary: buildFilterSummary(fp),
      expiresIn:     "7 days",
    })
  )

  // rawHtml, NOT contentHtml: `html` is already a complete rendered document — wrapping it would
  // double-chrome the email.
  await sendEmail({
    orgId:       PLATFORM_ORG_ID,
    templateKey: "ops.audit_export",
    to:          { email: adminEmail, name: "Pleks admin" },
    subject:     `Audit export ready — ${rowCount.toLocaleString()} rows`,
    rawHtml:     html,
  })

  await db.from("audit_exports")
    .update({ notification_sent_at: new Date().toISOString() })
    .eq("id", jobId)
}

async function processJob(db: Db, job: { id: string; filter_params: unknown }): Promise<void> {
  const jobId       = job.id
  const filterParams = (job.filter_params as ExportFilterParams) ?? {}

  await db.from("audit_exports")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)

  const { csvContent, rowCount } = await streamAuditCsv(jobId, filterParams)
  const fileName = `audit-exports/${jobId}.csv`
  const blob     = new Blob([csvContent], { type: "text/csv" })

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

  try {
    await sendExportEmail(jobId, db, signedData.signedUrl, rowCount, filterParams)
  } catch (mailErr) {
    console.error(`[process-audit-exports] email failed for job ${jobId}:`, mailErr)
  }
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const db = await createServiceClient()
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: jobs, error: fetchErr } = await db
    .from("audit_exports")
    .select("id, filter_params")
    .or(`status.eq.queued,and(status.eq.processing,started_at.lt.${tenMinAgo})`)
    .order("created_at")
    .limit(MAX_PER_RUN)

  if (fetchErr) {
    console.error("[process-audit-exports] fetch failed:", fetchErr.message)
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 })
  }

  const results: { id: string; status: string }[] = []

  for (const job of jobs ?? []) {
    try {
      await processJob(db, job as { id: string; filter_params: unknown })
      results.push({ id: job.id as string, status: "completed" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[process-audit-exports] job ${job.id} failed:`, msg)
      await db.from("audit_exports")
        .update({ status: "failed", error_message: msg.slice(0, 500) })
        .eq("id", job.id)
      results.push({ id: job.id as string, status: "failed" })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
