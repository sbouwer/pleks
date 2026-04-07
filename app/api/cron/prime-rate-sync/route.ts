import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Fetches the current SA prime lending rate from API Ninjas and upserts it
 * into the prime_rates table if it differs from the most recent stored rate.
 *
 * API Ninjas free tier: 3000 calls/month — runs once daily = ~31 calls/month.
 * Falls back silently if the API is unavailable.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.API_NINJAS_KEY
  if (!apiKey) {
    return Response.json({ error: "API_NINJAS_KEY not set" }, { status: 500 })
  }

  // Fetch current SA repo rate from API Ninjas (prime rates are premium-only;
  // SA prime = SARB repo rate + 3.5% spread, fixed by convention)
  const PRIME_SPREAD = 3.5
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
    // Prime = repo + 3.5% (fixed SA convention)
    fetchedRate = Math.round((saEntry.rate_pct + PRIME_SPREAD) * 100) / 100
  } catch (e) {
    return Response.json({ error: `Fetch failed: ${String(e)}` }, { status: 502 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Check most recent stored rate
  const { data: latest } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .single()

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
