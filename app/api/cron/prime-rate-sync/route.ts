/**
 * app/api/cron/prime-rate-sync/route.ts — daily SA prime-rate sync
 *
 * Route:  GET /api/cron/prime-rate-sync
 * Auth:   x-cron-secret header — runs inside the daily orchestrator
 * Data:   SARB Web API (primary) → API Ninjas (fallback) → prime_rates (service client)
 * Notes:  SARB is the source of truth and publishes the prime lending rate DIRECTLY (no repo+spread
 *         assumption) with no API key and no aggregator lag — so a daily sync detects an MPC change
 *         same-day. API Ninjas (repo + SA_PRIME_REPO_SPREAD) is only the fallback if SARB is unreachable.
 *         Inserts a new prime_rates row ONLY when the rate changes (stable rates → no new row), dating it
 *         to the source's published date (falls back to today if absent). For the exact MPC effective
 *         date, the manual admin override (/api/admin/prime-rate) remains authoritative. If BOTH sources
 *         fail it raises an immediate Sentry alert (not just a daily-digest line) + returns 502, because a
 *         silently-stale prime would otherwise only surface when an agent queries their arrears interest.
 */
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SA_PRIME_REPO_SPREAD } from "@/lib/constants"

interface PrimeFetch {
  rate: number
  /** the source's published date (YYYY-MM-DD), or null if absent/unparseable */
  changeDate: string | null
}

/** Parse a source date into YYYY-MM-DD; null when absent/unparseable (caller falls back to today). */
function parseSourceDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Primary: SARB Web API — central bank, free, no key, publishes the prime lending rate directly. */
async function fetchSarbPrime(): Promise<PrimeFetch | null> {
  try {
    const res = await fetch(
      "https://custom.resbank.co.za/SarbWebApi/WebIndicators/HomePageRates",
      { next: { revalidate: 0 } },
    )
    if (!res.ok) return null
    const json = await res.json() as { Name?: string; Value?: number; Date?: string }[]
    const prime = (Array.isArray(json) ? json : []).find(
      (r) => typeof r.Name === "string" && /prime lending rate/i.test(r.Name),
    )
    if (!prime || typeof prime.Value !== "number") return null
    return { rate: Math.round(prime.Value * 100) / 100, changeDate: parseSourceDate(prime.Date) }
  } catch {
    return null
  }
}

/** Fallback: API Ninjas interestrate — SA repo rate + the documented SA_PRIME_REPO_SPREAD. */
async function fetchApiNinjasPrime(apiKey: string): Promise<PrimeFetch | null> {
  try {
    const res = await fetch(
      "https://api.api-ninjas.com/v1/interestrate",
      { headers: { "X-Api-Key": apiKey }, next: { revalidate: 0 } },
    )
    if (!res.ok) return null
    const json = await res.json() as {
      central_bank_rates?: { country: string; rate_pct: number; last_updated: string }[]
    }
    const sa = (json.central_bank_rates ?? []).find((r) => r.country === "South_Africa")
    if (!sa || typeof sa.rate_pct !== "number") return null
    return {
      rate: Math.round((sa.rate_pct + SA_PRIME_REPO_SPREAD) * 100) / 100,
      changeDate: parseSourceDate(sa.last_updated),
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // SARB primary (no key); API Ninjas only if SARB is unreachable.
  let result = await fetchSarbPrime()
  let source = "SARB"
  if (!result) {
    const apiKey = process.env.API_NINJAS_KEY
    if (apiKey) {
      result = await fetchApiNinjasPrime(apiKey)
      source = "API Ninjas (SARB fallback)"
    }
  }
  if (!result) {
    // BOTH sources down. The prime drives arrears interest (a financial/legal figure), so raise an
    // immediate Sentry alert — don't let it sit silently until the daily digest, or worse, until an
    // agent notices a stale rate. A single-source outage is fine (the fallback covers it); only a
    // total failure is loud.
    Sentry.captureException(
      new Error("prime-rate-sync: prime rate unavailable from BOTH SARB and API Ninjas — rate may be going stale"),
      { level: "error", tags: { cron: "prime-rate-sync", severity: "both_sources_failed" } },
    )
    return Response.json({ error: "Prime rate unavailable from SARB and API Ninjas" }, { status: 502 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  // Date the row to the source's published date; fall back to today only if it's missing/garbled.
  const effectiveDate = result.changeDate ?? today

  // Check most recent stored rate
  const { data: latest, error: latestError } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("GET prime_rates", latestError)

  if (latest && Number(latest.rate_percent) === result.rate) {
    return Response.json({ status: "unchanged", rate: result.rate, since: latest.effective_date, source })
  }

  // Rate has changed (or no data yet) — insert new row
  const dateNote = result.changeDate ? "" : " (effective date defaulted to sync day)"
  const { error } = await supabase.from("prime_rates").insert({
    effective_date: effectiveDate,
    rate_percent: result.rate,
    notes: `${source} daily sync${dateNote}`,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    status: "updated",
    rate: result.rate,
    previous: latest?.rate_percent ?? null,
    effective_date: effectiveDate,
    source,
  })
}
