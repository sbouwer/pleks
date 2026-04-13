import { createServiceClient } from "@/lib/supabase/server"
import type { ContractorPerformanceData, ContractorPerformanceRow, ReportFilters } from "./types"

export async function buildContractorPerformance(filters: ReportFilters): Promise<ContractorPerformanceData> {
  const db = await createServiceClient()
  const { orgId, from, to } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  const { data, error } = await db
    .from("maintenance_requests")
    .select("id, status, contractor_id, actual_cost_cents, created_at, completed_at, contractors(id, name, trade)")
    .eq("org_id", orgId)
    .not("contractor_id", "is", null)
    .gte("created_at", fromStr)
    .lte("created_at", toStr)

  if (error) console.error("contractorPerformance:", error.message)

  const contractorMap = new Map<string, { name: string; trade: string | null; assigned: number; completed: number; spend: number }>()

  for (const job of data ?? []) {
    const cid = job.contractor_id as string
    const cRaw = job.contractors as unknown as { id: string; name: string; trade: string | null } | null
    const existing = contractorMap.get(cid) ?? { name: cRaw?.name ?? "Unknown", trade: cRaw?.trade ?? null, assigned: 0, completed: 0, spend: 0 }
    contractorMap.set(cid, {
      ...existing,
      assigned: existing.assigned + 1,
      completed: existing.completed + (job.status === "completed" ? 1 : 0),
      spend: existing.spend + (job.actual_cost_cents as number ?? 0),
    })
  }

  const rows: ContractorPerformanceRow[] = Array.from(contractorMap.values()).map((c) => ({
    contractor_name: c.name,
    trade: c.trade,
    jobs_assigned: c.assigned,
    jobs_completed: c.completed,
    total_spend_cents: c.spend,
  }))

  rows.sort((a, b) => b.total_spend_cents - a.total_spend_cents)

  return {
    period: { from, to },
    rows,
    total_contractors: rows.length,
    total_spend_cents: rows.reduce((s, r) => s + r.total_spend_cents, 0),
  }
}
