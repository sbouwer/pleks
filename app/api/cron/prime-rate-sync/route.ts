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

  // Fetch current prime rate from API Ninjas
  let fetchedRate: number
  try {
    const res = await fetch(
      "https://api.api-ninjas.com/v1/interestrate?country=south%20africa",
      { headers: { "X-Api-Key": apiKey }, next: { revalidate: 0 } }
    )
    if (!res.ok) {
      return Response.json({ error: `API Ninjas responded ${res.status}` }, { status: 502 })
    }
    const json = await res.json() as {
      central_bank_rates?: { rate_pct: number; name: string }[]
      loan_rates?: { rate_pct: number; name: string }[]
    }
    // Look for prime / lending rate in loan_rates
    const loanRates = json.loan_rates ?? []
    const primeEntry = loanRates.find(
      (r) => r.name.toLowerCase().includes("prime") || r.name.toLowerCase().includes("lending")
    )
    if (!primeEntry) {
      return Response.json({ error: "Prime rate not found in API response", json }, { status: 502 })
    }
    fetchedRate = primeEntry.rate_pct
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
