import { createServiceClient } from "@/lib/supabase/server"
import type { ContractorPerformanceData, ContractorPerformanceRow, ReportFilters } from "./types"

type JobRow = { id: unknown; status: unknown; contractor_id: unknown; actual_cost_cents: unknown; contractors: unknown }
type DelayRow = { maintenance_id: unknown; delay_type: unknown }
type DelayTally = { no_shows: number; reschedules: number; incomplete_returns: number; no_responses: number }

function buildJobContractorMap(jobs: JobRow[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const j of jobs) {
    if (j.contractor_id) m.set(j.id as string, j.contractor_id as string)
  }
  return m
}

function buildDelayMap(delays: DelayRow[], jobToContractor: Map<string, string>): Map<string, DelayTally> {
  const m = new Map<string, DelayTally>()
  for (const d of delays) {
    const cid = jobToContractor.get(d.maintenance_id as string)
    if (!cid) continue
    const t = m.get(cid) ?? { no_shows: 0, reschedules: 0, incomplete_returns: 0, no_responses: 0 }
    if (d.delay_type === "contractor_no_show") t.no_shows++
    else if (d.delay_type === "contractor_rescheduled") t.reschedules++
    else if (d.delay_type === "contractor_returned_incomplete") t.incomplete_returns++
    else if (d.delay_type === "contractor_no_response") t.no_responses++
    m.set(cid, t)
  }
  return m
}

function buildContractorMap(jobs: JobRow[]): Map<string, { name: string; trade: string | null; assigned: number; completed: number; spend: number }> {
  const m = new Map<string, { name: string; trade: string | null; assigned: number; completed: number; spend: number }>()
  for (const job of jobs) {
    const cid = job.contractor_id as string
    const cRaw = job.contractors as { id: string; name: string; trade: string | null } | null
    const existing = m.get(cid) ?? { name: cRaw?.name ?? "Unknown", trade: cRaw?.trade ?? null, assigned: 0, completed: 0, spend: 0 }
    m.set(cid, {
      ...existing,
      assigned: existing.assigned + 1,
      completed: existing.completed + (job.status === "completed" ? 1 : 0),
      spend: existing.spend + ((job.actual_cost_cents as number) ?? 0),
    })
  }
  return m
}

export async function buildContractorPerformance(filters: ReportFilters): Promise<ContractorPerformanceData> {
  const db = await createServiceClient()
  const { orgId, from, to } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  const { data: jobs, error: jobErr } = await db
    .from("maintenance_requests")
    .select("id, status, contractor_id, actual_cost_cents, contractors(id, name, trade)")
    .eq("org_id", orgId)
    .not("contractor_id", "is", null)
    .gte("created_at", fromStr)
    .lte("created_at", toStr)

  if (jobErr) console.error("contractorPerformance:", jobErr.message)

  const allJobs = jobs ?? []
  const jobIds = allJobs.map((j) => j.id as string)

  const { data: delays, error: delayErr } = jobIds.length > 0
    ? await db
        .from("maintenance_delay_events")
        .select("maintenance_id, delay_type")
        .eq("org_id", orgId)
        .in("maintenance_id", jobIds)
        .eq("attributed_to", "contractor")
    : { data: [], error: null }

  if (delayErr) console.error("contractorPerformance delays:", delayErr.message)

  const jobToContractor = buildJobContractorMap(allJobs)
  const delayMap = buildDelayMap(delays ?? [], jobToContractor)
  const contractorMap = buildContractorMap(allJobs)

  const ZERO_TALLY: DelayTally = { no_shows: 0, reschedules: 0, incomplete_returns: 0, no_responses: 0 }
  const rows: ContractorPerformanceRow[] = Array.from(contractorMap.entries()).map(([cid, c]) => {
    const d = delayMap.get(cid) ?? ZERO_TALLY
    return {
      contractor_name: c.name,
      trade: c.trade,
      jobs_assigned: c.assigned,
      jobs_completed: c.completed,
      total_spend_cents: c.spend,
      no_shows: d.no_shows,
      reschedules: d.reschedules,
      incomplete_returns: d.incomplete_returns,
      no_responses: d.no_responses,
    }
  })

  rows.sort((a, b) => b.total_spend_cents - a.total_spend_cents)

  return {
    period: { from, to },
    rows,
    total_contractors: rows.length,
    total_spend_cents: rows.reduce((s, r) => s + r.total_spend_cents, 0),
  }
}
