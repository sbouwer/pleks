import { NextRequest } from "next/server"
import { GET as invoiceGenerate } from "../invoice-generate/route"
import { GET as leaseExpiryCheck } from "../lease-expiry-check/route"
import { GET as arrearsSequence } from "../arrears-sequence/route"
import { GET as scheduledReports } from "../scheduled-reports/route"
import { GET as debicheckCollection } from "../debicheck-collection/route"
import { GET as ownerStatementGen } from "../owner-statement-gen/route"

// Single daily cron — runs all jobs sequentially at 05:00 UTC (07:00 SAST)
// Vercel free tier only allows 1 cron job
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, string> = {}
  const today = new Date()
  const dayOfMonth = today.getUTCDate()

  // Build a request with the cron secret header
  const cronReq = new NextRequest(req.url, {
    headers: new Headers({ "x-cron-secret": process.env.CRON_SECRET! }),
  })

  // 1. Invoice generation (daily)
  try {
    const res = await invoiceGenerate(cronReq)
    results.invoice_generate = res.ok ? "ok" : "failed"
  } catch { results.invoice_generate = "error" }

  // 2. Lease expiry check (daily)
  try {
    const res = await leaseExpiryCheck(cronReq)
    results.lease_expiry_check = res.ok ? "ok" : "failed"
  } catch { results.lease_expiry_check = "error" }

  // 3. Arrears sequence (daily)
  try {
    const res = await arrearsSequence(cronReq)
    results.arrears_sequence = res.ok ? "ok" : "failed"
  } catch { results.arrears_sequence = "error" }

  // 4. DebiCheck collection (daily)
  try {
    const res = await debicheckCollection(cronReq)
    results.debicheck_collection = res.ok ? "ok" : "failed"
  } catch { results.debicheck_collection = "error" }

  // 5. Scheduled reports (daily — checks if any are due today)
  try {
    const res = await scheduledReports(cronReq)
    results.scheduled_reports = res.ok ? "ok" : "failed"
  } catch { results.scheduled_reports = "error" }

  // 6. Owner statement generation (2nd of month only)
  if (dayOfMonth === 2) {
    try {
      const res = await ownerStatementGen(cronReq)
      results.owner_statement_gen = res.ok ? "ok" : "failed"
    } catch { results.owner_statement_gen = "error" }
  } else {
    results.owner_statement_gen = "skipped (not 2nd)"
  }

  return Response.json({ ok: true, ran_at: today.toISOString(), results })
}
