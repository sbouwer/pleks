import { NextRequest } from "next/server"
import { GET as invoiceGenerate } from "../invoice-generate/route"
import { GET as leaseExpiryCheck } from "../lease-expiry-check/route"
import { GET as arrearsSequence } from "../arrears-sequence/route"
import { GET as scheduledReports } from "../scheduled-reports/route"
import { GET as debicheckCollection } from "../debicheck-collection/route"
import { GET as ownerStatementGen } from "../owner-statement-gen/route"
import { GET as depositInterest } from "../deposit-interest/route"
import { GET as levyGenerate } from "../levy-generate/route"
import { GET as arrearsInterest } from "../arrears-interest/route"
import { GET as trialExpiry } from "../trial-expiry/route"

type CronHandler = (req: NextRequest) => Promise<Response>

async function runJob(
  name: string,
  handler: CronHandler,
  cronReq: NextRequest,
  results: Record<string, string>
) {
  try {
    const res = await handler(cronReq)
    results[name] = res.ok ? "ok" : "failed"
  } catch {
    results[name] = "error"
  }
}

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

  const cronReq = new NextRequest(req.url, {
    headers: new Headers({ "x-cron-secret": process.env.CRON_SECRET! }),
  })

  // Daily jobs
  await runJob("invoice_generate", invoiceGenerate, cronReq, results)
  await runJob("lease_expiry_check", leaseExpiryCheck, cronReq, results)
  await runJob("arrears_sequence", arrearsSequence, cronReq, results)
  await runJob("debicheck_collection", debicheckCollection, cronReq, results)
  await runJob("scheduled_reports", scheduledReports, cronReq, results)
  await runJob("deposit_interest", depositInterest, cronReq, results)
  await runJob("arrears_interest", arrearsInterest, cronReq, results)
  await runJob("trial_expiry", trialExpiry, cronReq, results)

  // Monthly jobs
  if (dayOfMonth === 1) {
    await runJob("levy_generate", levyGenerate, cronReq, results)
  } else {
    results.levy_generate = "skipped (not 1st)"
  }

  if (dayOfMonth === 2) {
    await runJob("owner_statement_gen", ownerStatementGen, cronReq, results)
  } else {
    results.owner_statement_gen = "skipped (not 2nd)"
  }

  return Response.json({ ok: true, ran_at: today.toISOString(), results })
}
