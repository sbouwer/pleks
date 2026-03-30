import type { SupabaseClient } from "@supabase/supabase-js"
import type { GLPropertyBlock, GLTransaction, GLDepositTransaction } from "./parseGLReport"

// ── Types ──────────────────────────────────────────────────────────────

export interface GLImportResult {
  transactionsCreated: number
  depositsCreated: number
  skipped: number
  errors: Array<{ description: string; message: string }>
  outstandingBalances: Array<{ propertyName: string; balance: number }>
}

interface LeaseDetails {
  propertyId: string
  unitId: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildPropertyKey(block: GLPropertyBlock): string {
  return `${block.propertyName}(${block.ownerName})`
}

function isWithinDateFilter(
  date: Date,
  filter: { from: string; to: string },
): boolean {
  const from = new Date(filter.from)
  const to = new Date(filter.to)
  return date >= from && date <= to
}

function mapTransactionType(
  txType: GLTransaction["type"],
): string {
  return txType === "invoice" ? "rent_invoice" : "rent_received"
}

function mapDirection(txType: GLTransaction["type"]): "debit" | "credit" {
  return txType === "invoice" ? "debit" : "credit"
}

function mapDepositTransactionType(
  depType: GLDepositTransaction["type"],
): string {
  switch (depType) {
    case "deposit_received":
      return "deposit_received"
    case "deposit_interest":
      return "deposit_interest"
    case "deposit_topup":
      return "deposit_received"
  }
}

function mapDepositDirection(
  dep: GLDepositTransaction,
): "debit" | "credit" {
  return dep.creditCents > 0 ? "credit" : "debit"
}

function mapDepositAmount(dep: GLDepositTransaction): number {
  return dep.creditCents > 0 ? dep.creditCents : dep.debitCents
}

// ── Duplicate check ────────────────────────────────────────────────────

async function isDuplicate(
  supabase: SupabaseClient,
  leaseId: string,
  amountCents: number,
  date: Date,
): Promise<boolean> {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000
  const fromDate = new Date(date.getTime() - threeDaysMs)
  const toDate = new Date(date.getTime() + threeDaysMs)

  const { data } = await supabase
    .from("trust_transactions")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("amount_cents", amountCents)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString())
    .limit(1)

  return (data?.length ?? 0) > 0
}

// ── Lease details fetcher ──────────────────────────────────────────────

const leaseDetailsCache = new Map<string, LeaseDetails | null>()

async function fetchLeaseDetails(
  supabase: SupabaseClient,
  leaseId: string,
): Promise<LeaseDetails | null> {
  const cached = leaseDetailsCache.get(leaseId)
  if (cached !== undefined) return cached

  const { data, error } = await supabase
    .from("leases")
    .select("unit_id, units!inner(property_id)")
    .eq("id", leaseId)
    .limit(1)
    .single()

  if (error || !data) {
    leaseDetailsCache.set(leaseId, null)
    return null
  }

  const unitId = String(data.unit_id)
  // units is joined — could be object or array depending on Supabase version
  const unitsRaw = data.units as unknown
  const units = Array.isArray(unitsRaw) ? (unitsRaw[0] as Record<string, unknown> | undefined) : (unitsRaw as Record<string, unknown> | null)
  const propId = units?.property_id
  const propertyId = typeof propId === "string" ? propId : ""

  const details: LeaseDetails = { propertyId, unitId }
  leaseDetailsCache.set(leaseId, details)
  return details
}

// ── Main import function ───────────────────────────────────────────────

export async function runGLImport(
  blocks: GLPropertyBlock[],
  leaseMatches: Record<string, string>,
  propertyMatches: Record<string, string>,
  dateFilter: { from: string; to: string },
  importDeposits: boolean,
  orgId: string,
  agentId: string,
  supabase: SupabaseClient,
): Promise<GLImportResult> {
  // Clear lease details cache for each import run
  leaseDetailsCache.clear()

  const result: GLImportResult = {
    transactionsCreated: 0,
    depositsCreated: 0,
    skipped: 0,
    errors: [],
    outstandingBalances: [],
  }

  for (const block of blocks) {
    const propertyKey = buildPropertyKey(block)

    // Process AR transactions
    for (const tx of block.arTransactions) {
      if (!isWithinDateFilter(tx.date, dateFilter)) {
        result.skipped++
        continue
      }

      // Resolve leaseId: try unitRef first, then property key
      let leaseId: string | undefined
      if (tx.unitRef) {
        leaseId = leaseMatches[tx.unitRef]
      }
      if (!leaseId) {
        leaseId = propertyMatches[propertyKey]
      }

      if (!leaseId) {
        result.errors.push({
          description: tx.rawDescription,
          message: `No lease match found for unit ref "${tx.unitRef ?? "none"}" in property "${propertyKey}"`,
        })
        result.skipped++
        continue
      }

      // Duplicate check
      const duplicate = await isDuplicate(supabase, leaseId, tx.amountCents, tx.date)
      if (duplicate) {
        result.skipped++
        continue
      }

      // Fetch lease details
      const details = await fetchLeaseDetails(supabase, leaseId)
      if (!details) {
        result.errors.push({
          description: tx.rawDescription,
          message: `Could not fetch lease details for lease "${leaseId}"`,
        })
        result.skipped++
        continue
      }

      const { error } = await supabase.from("trust_transactions").insert({
        org_id: orgId,
        property_id: details.propertyId,
        unit_id: details.unitId,
        lease_id: leaseId,
        transaction_type: mapTransactionType(tx.type),
        direction: mapDirection(tx.type),
        amount_cents: tx.amountCents,
        description: `${tx.description} (imported from TPN GL)`,
        is_opening_balance: true,
        created_by: agentId,
      })

      if (error) {
        result.errors.push({
          description: tx.rawDescription,
          message: `Insert failed: ${error.message}`,
        })
      } else {
        result.transactionsCreated++
      }
    }

    // Process deposit transactions
    if (importDeposits) {
      for (const dep of block.depositTransactions) {
        if (!isWithinDateFilter(dep.date, dateFilter)) {
          result.skipped++
          continue
        }

        // For deposits, resolve via property key (no unit ref available)
        const leaseId = propertyMatches[propertyKey]
        if (!leaseId) {
          result.errors.push({
            description: dep.rawDescription,
            message: `No lease match found for deposit in property "${propertyKey}"`,
          })
          result.skipped++
          continue
        }

        const amount = mapDepositAmount(dep)
        const duplicate = await isDuplicate(supabase, leaseId, amount, dep.date)
        if (duplicate) {
          result.skipped++
          continue
        }

        const details = await fetchLeaseDetails(supabase, leaseId)
        if (!details) {
          result.errors.push({
            description: dep.rawDescription,
            message: `Could not fetch lease details for lease "${leaseId}"`,
          })
          result.skipped++
          continue
        }

        const { error } = await supabase.from("trust_transactions").insert({
          org_id: orgId,
          property_id: details.propertyId,
          unit_id: details.unitId,
          lease_id: leaseId,
          transaction_type: mapDepositTransactionType(dep.type),
          direction: mapDepositDirection(dep),
          amount_cents: amount,
          description: `${dep.rawDescription} (imported from TPN GL)`,
          is_opening_balance: true,
          created_by: agentId,
        })

        if (error) {
          result.errors.push({
            description: dep.rawDescription,
            message: `Deposit insert failed: ${error.message}`,
          })
        } else {
          result.depositsCreated++
        }
      }
    }

    // Track outstanding balances
    if (block.closingBalance > 0) {
      result.outstandingBalances.push({
        propertyName: block.propertyName,
        balance: block.closingBalance,
      })
    }
  }

  return result
}
