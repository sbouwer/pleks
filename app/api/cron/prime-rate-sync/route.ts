/**
 * app/api/cron/prime-rate-sync/route.ts — daily SA prime-rate sync from the rate feed
 *
 * Route:  GET /api/cron/prime-rate-sync
 * Auth:   x-cron-secret header — runs inside the daily orchestrator
 * Data:   API Ninjas interestrate endpoint → prime_rates (service client)
 * Notes:  SA prime = SARB repo + SA_PRIME_REPO_SPREAD (lib/constants — documented, not a magic number).
 *         Inserts a new prime_rates row ONLY when the rate changes (stable rates → no new row, by design),
 *         so the row's effective_date is the last CHANGE, not the last sync. On API failure returns 502 —
 *         and that failure is now surfaced by the daily cron digest (runJob → { failed } → ADMIN_EMAIL),
 *         so a sustained outage can't let the prime (which drives arrears interest) go stale unnoticed.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SA_PRIME_REPO_SPREAD } from "@/lib/constants"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.API_NINJAS_KEY
  if (!apiKey) {
    return Response.json({ error: "API_NINJAS_KEY not set" }, { status: 500 })
  }

  // Fetch the SA repo rate from API Ninjas (prime rates are premium-only). SA prime = repo + the documented
  // SA_PRIME_REPO_SPREAD (lib/constants), not a magic number.
  let fetchedRate: number
  try {
    const res = await fetch(
      "https://api.api-ninjas.com/v1/interestrate",
      { headers: { "X-Api-Key": apiKey }, next: { revalidate: 0 } }
    )
    if (!res.ok) {
      return Response.json({ error: `API Ninjas responded ${res.status}` }, { status: 502 })
    }
    const json = await res.json() as {
      central_bank_rates?: { country: string; rate_pct: number; last_updated: string }[]
    }
    const saEntry = (json.central_bank_rates ?? []).find(
      (r) => r.country === "South_Africa"
    )
    if (!saEntry) {
      return Response.json({ error: "South Africa not found in API response" }, { status: 502 })
    }
    fetchedRate = Math.round((saEntry.rate_pct + SA_PRIME_REPO_SPREAD) * 100) / 100
  } catch (e) {
    return Response.json({ error: `Fetch failed: ${String(e)}` }, { status: 502 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Check most recent stored rate
  const { data: latest, error: latestError } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("GET prime_rates", latestError)

  if (latest && Number(latest.rate_percent) === fetchedRate) {
    return Response.json({ status: "unchanged", rate: fetchedRate, since: latest.effective_date })
  }

  // Rate has changed (or no data yet) — insert new row
  const { error } = await supabase.from("prime_rates").insert({
    effective_date: today,
    rate_percent: fetchedRate,
    notes: "API Ninjas daily sync",
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    status: "updated",
    rate: fetchedRate,
    previous: latest?.rate_percent ?? null,
    effective_date: today,
  })
}
