import { createServiceClient } from "@/lib/supabase/server"
import type { DepositRegisterData, DepositRegisterRow, ReportFilters } from "./types"

// RHA Section 5(3): landlord has 14 days to return deposit after lease end
const RETURN_DEADLINE_DAYS = 14

type HoldEntry = {
  principal: number
  interest: number
  date: string
  tenantName: string
  unit: string
  property: string
  leaseEndDate: string | null
  leaseStatus: string | null
}

type TxnRecord = {
  tenant_id: unknown
  amount_cents: unknown
  direction: unknown
  transaction_type: unknown
  created_at: unknown
  leases: unknown
  tenants: unknown
}

function resolveTenantName(tenants: unknown): string {
  const tenantRaw = tenants as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
  const tc = tenantRaw?.contacts
  if (!tc) return "Tenant"
  if (tc.entity_type === "company") return tc.company_name ?? "Tenant"
  return `${tc.first_name ?? ""} ${tc.last_name ?? ""}`.trim() || "Tenant"
}

function resolveLeaseInfo(leases: unknown): { unitNumber: string; propName: string; leaseEndDate: string | null; leaseStatus: string | null } {
  const leaseRaw = leases as { end_date: string | null; status: string | null; units: { unit_number: string; properties: { name: string } | null } | null } | null
  return {
    unitNumber: leaseRaw?.units?.unit_number ?? "—",
    propName: leaseRaw?.units?.properties?.name ?? "—",
    leaseEndDate: leaseRaw?.end_date ?? null,
    leaseStatus: leaseRaw?.status ?? null,
  }
}

function applyTxn(entry: HoldEntry, t: TxnRecord): void {
  const amt = t.amount_cents as number
  const isCredit = t.direction === "credit"
  const txType = t.transaction_type as string

  if (txType === "interest_accrued") {
    entry.interest += isCredit ? amt : -amt
  } else {
    entry.principal += isCredit ? amt : -amt
  }
}

function computeDeadline(leaseEndDate: string | null, leaseStatus: string | null, now: Date): number | null {
  if (!leaseEndDate) return null
  if (leaseStatus !== "ended" && leaseStatus !== "terminated") return null
  const daysSinceEnd = Math.floor((now.getTime() - new Date(leaseEndDate).getTime()) / (1000 * 60 * 60 * 24))
  return RETURN_DEADLINE_DAYS - daysSinceEnd
}

function buildHoldMap(txns: TxnRecord[]): Map<string, HoldEntry> {
  const holdMap = new Map<string, HoldEntry>()

  for (const t of txns) {
    const tid = t.tenant_id as string
    const { unitNumber, propName, leaseEndDate, leaseStatus } = resolveLeaseInfo(t.leases)
    const existing = holdMap.get(tid) ?? {
      principal: 0,
      interest: 0,
      date: (t.created_at as string).slice(0, 10),
      tenantName: resolveTenantName(t.tenants),
      unit: unitNumber,
      property: propName,
      leaseEndDate,
      leaseStatus,
    }
    applyTxn(existing, t)
    holdMap.set(tid, existing)
  }

  return holdMap
}

export async function buildDepositRegister(filters: ReportFilters): Promise<DepositRegisterData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("deposit_transactions")
    .select("id, tenant_id, amount_cents, direction, transaction_type, created_at, leases(end_date, status, units(unit_number, properties(name))), tenants(contacts(first_name, last_name, company_name, entity_type))")
    .eq("org_id", orgId)
    .in("transaction_type", ["deposit_received", "interest_accrued", "deduction_applied", "deposit_returned_to_tenant"])
    .order("transaction_date", { ascending: true })

  if (error) console.error("depositRegister:", error.message)

  const holdMap = buildHoldMap((data ?? []) as TxnRecord[])
  const now = new Date()
  const rows: DepositRegisterRow[] = []

  for (const [, v] of holdMap) {
    const totalHeld = v.principal + v.interest
    if (totalHeld <= 0) continue
    const isEnded = v.leaseStatus === "ended" || v.leaseStatus === "terminated"
    rows.push({
      tenant_name: v.tenantName,
      unit_number: v.unit,
      property_name: v.property,
      amount_cents: v.principal,
      interest_cents: v.interest,
      date_received: v.date,
      lease_end_date: v.leaseEndDate,
      days_until_return_deadline: computeDeadline(v.leaseEndDate, v.leaseStatus, now),
      status: isEnded ? "awaiting_return" : "held",
    })
  }

  rows.sort((a, b) => a.property_name.localeCompare(b.property_name))

  return {
    as_at: now,
    rows,
    total_held_cents: rows.reduce((s, r) => s + r.amount_cents + r.interest_cents, 0),
    count: rows.length,
  }
}
