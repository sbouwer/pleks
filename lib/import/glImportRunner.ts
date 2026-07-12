/**
 * lib/import/glImportRunner.ts — import parsed TPN GL AR + deposit transactions into the trust ledger as opening balances
 *
 * Data:   reads leases (property/unit resolution, cached) and trust_transactions (dedup); writes trust rows via recordTrustTransaction.
 * Notes:  dedup uses a ±3-day window on lease_id + amount; GL "invoice" rows are skipped (a receivable, not a trust movement); every row is flagged isOpeningBalance.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { GLPropertyBlock, GLTransaction, GLDepositTransaction } from "./parseGLReport"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordTrustTransaction, type TrustTransactionType } from "@/lib/trust/invariants"

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

function mapDepositTransactionType(
  depType: GLDepositTransaction["type"],
): TrustTransactionType {
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
  orgId: string,
): Promise<boolean> {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000
  const fromDate = new Date(date.getTime() - threeDaysMs)
  const toDate = new Date(date.getTime() + threeDaysMs)

  const { data, error: queryError } = await supabase
    .from("trust_transactions")
    .select("id")
    .eq("org_id", orgId)          // dedup is within the caller's org — never an existence oracle on another org's ledger
    .eq("lease_id", leaseId)
    .eq("amount_cents", amountCents)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString())
    .limit(1)
    logQueryError("isDuplicate trust_transactions", queryError)

  return (data?.length ?? 0) > 0
}

// ── Lease details fetcher ──────────────────────────────────────────────

const leaseDetailsCache = new Map<string, LeaseDetails | null>()

async function fetchLeaseDetails(
  supabase: SupabaseClient,
  leaseId: string,
  orgId: string,
): Promise<LeaseDetails | null> {
  // Cache key MUST include orgId: the Map is module-level (survives across concurrent requests in one warm
  // lambda), and reading it before the query would otherwise let Org B get a cache hit on Org A's leaseId —
  // short-circuiting the org check below. Keyed by org, a foreign leaseId can never resolve from cache.
  const cacheKey = `${orgId}:${leaseId}`
  const cached = leaseDetailsCache.get(cacheKey)
  if (cached !== undefined) return cached

  const { data, error } = await supabase
    .from("leases")
    .select("unit_id, units!inner(property_id)")
    .eq("id", leaseId)
    .eq("org_id", orgId)   // F-2 (AUDIT_IMPORT): leaseId is client-supplied (leaseMatches/propertyMatches) —
    .limit(1)              // it MUST belong to the caller's org, or a tampered body writes a trust row against
    .maybeSingle()         // another org's lease. A foreign id now resolves to null → the transaction is skipped.

  if (error || !data) {
    leaseDetailsCache.set(cacheKey, null)
    return null
  }

  const unitId = String(data.unit_id)
  // units is joined — could be object or array depending on Supabase version
  const unitsRaw = data.units as unknown
  const units = Array.isArray(unitsRaw) ? (unitsRaw[0] as Record<string, unknown> | undefined) : (unitsRaw as Record<string, unknown> | null)
  const propId = units?.property_id
  const propertyId = typeof propId === "string" ? propId : ""

  const details: LeaseDetails = { propertyId, unitId }
  leaseDetailsCache.set(cacheKey, details)
  return details
}

// ── Main import function ───────────────────────────────────────────────

export interface GLImportOptions {
  orgId: string
  agentId: string
  importDeposits: boolean
  dateFilter: { from: string; to: string }
}

interface GLImportContext {
  leaseMatches: Record<string, string>
  propertyMatches: Record<string, string>
  dateFilter: { from: string; to: string }
  orgId: string
  agentId: string
  supabase: SupabaseClient
  result: GLImportResult
}

async function importArTransaction(
  tx: GLTransaction,
  propertyKey: string,
  ctx: GLImportContext,
): Promise<void> {
  if (!isWithinDateFilter(tx.date, ctx.dateFilter)) {
    ctx.result.skipped++
    return
  }

  // Resolve leaseId: try unitRef first, then property key
  let leaseId: string | undefined
  if (tx.unitRef) {
    leaseId = ctx.leaseMatches[tx.unitRef]
  }
  if (!leaseId) {
    leaseId = ctx.propertyMatches[propertyKey]
  }

  if (!leaseId) {
    ctx.result.errors.push({
      description: tx.rawDescription,
      message: `No lease match found for unit ref "${tx.unitRef ?? "none"}" in property "${propertyKey}"`,
    })
    ctx.result.skipped++
    return
  }

  const duplicate = await isDuplicate(ctx.supabase, leaseId, tx.amountCents, tx.date, ctx.orgId)
  if (duplicate) {
    ctx.result.skipped++
    return
  }

  const details = await fetchLeaseDetails(ctx.supabase, leaseId, ctx.orgId)
  if (!details) {
    ctx.result.errors.push({
      description: tx.rawDescription,
      message: `Could not fetch lease details for lease "${leaseId}"`,
    })
    ctx.result.skipped++
    return
  }

  // A GL "invoice" is a receivable (rent charged), not a movement in the agency's trust account — it doesn't
  // belong in trust_transactions. The old code mapped it to the invalid 'rent_invoice', so the insert always
  // failed the CHECK anyway; skip it explicitly. (F-3 ruling; revisit if GL invoice opening balances ever need
  // their own recording — they'd be rent_invoices, not trust rows.)
  if (tx.type === "invoice") {
    ctx.result.skipped++
    return
  }

  try {
    await recordTrustTransaction({
      orgId: ctx.orgId,
      propertyId: details.propertyId ?? undefined,
      unitId: details.unitId ?? undefined,
      leaseId,
      transactionType: "rent_received",
      direction: "credit",
      amountCents: tx.amountCents,
      description: `${tx.description} (imported from TPN GL)`,
      isOpeningBalance: true,
      createdBy: ctx.agentId,
      source: "agency_bank",
      initiatedBy: "agent",
    })
    ctx.result.transactionsCreated++
  } catch (e) {
    ctx.result.errors.push({ description: tx.rawDescription, message: `Insert failed: ${e instanceof Error ? e.message : String(e)}` })
  }
}

async function importDepositTransaction(
  dep: GLDepositTransaction,
  propertyKey: string,
  ctx: GLImportContext,
): Promise<void> {
  if (!isWithinDateFilter(dep.date, ctx.dateFilter)) {
    ctx.result.skipped++
    return
  }

  // For deposits, resolve via property key (no unit ref available)
  const leaseId = ctx.propertyMatches[propertyKey]
  if (!leaseId) {
    ctx.result.errors.push({
      description: dep.rawDescription,
      message: `No lease match found for deposit in property "${propertyKey}"`,
    })
    ctx.result.skipped++
    return
  }

  const amount = mapDepositAmount(dep)
  const duplicate = await isDuplicate(ctx.supabase, leaseId, amount, dep.date, ctx.orgId)
  if (duplicate) {
    ctx.result.skipped++
    return
  }

  const details = await fetchLeaseDetails(ctx.supabase, leaseId, ctx.orgId)
  if (!details) {
    ctx.result.errors.push({
      description: dep.rawDescription,
      message: `Could not fetch lease details for lease "${leaseId}"`,
    })
    ctx.result.skipped++
    return
  }

  try {
    await recordTrustTransaction({
      orgId: ctx.orgId,
      propertyId: details.propertyId ?? undefined,
      unitId: details.unitId ?? undefined,
      leaseId,
      transactionType: mapDepositTransactionType(dep.type),
      direction: mapDepositDirection(dep),
      amountCents: amount,
      description: `${dep.rawDescription} (imported from TPN GL)`,
      isOpeningBalance: true,
      createdBy: ctx.agentId,
      source: "agency_bank",
      initiatedBy: "agent",
    })
    ctx.result.depositsCreated++
  } catch (e) {
    ctx.result.errors.push({ description: dep.rawDescription, message: `Deposit insert failed: ${e instanceof Error ? e.message : String(e)}` })
  }
}

export async function runGLImport(
  blocks: GLPropertyBlock[],
  leaseMatches: Record<string, string>,
  propertyMatches: Record<string, string>,
  options: GLImportOptions,
  supabase: SupabaseClient,
): Promise<GLImportResult> {
  const { orgId, agentId, importDeposits, dateFilter } = options

  // Clear lease details cache for each import run
  leaseDetailsCache.clear()

  const ctx: GLImportContext = {
    leaseMatches,
    propertyMatches,
    dateFilter,
    orgId,
    agentId,
    supabase,
    result: {
      transactionsCreated: 0,
      depositsCreated: 0,
      skipped: 0,
      errors: [],
      outstandingBalances: [],
    },
  }

  for (const block of blocks) {
    const propertyKey = buildPropertyKey(block)

    // Process AR transactions
    for (const tx of block.arTransactions) {
      await importArTransaction(tx, propertyKey, ctx)
    }

    // Process deposit transactions
    if (importDeposits) {
      for (const dep of block.depositTransactions) {
        await importDepositTransaction(dep, propertyKey, ctx)
      }
    }

    // Track outstanding balances
    if (block.closingBalance > 0) {
      ctx.result.outstandingBalances.push({
        propertyName: block.propertyName,
        balance: block.closingBalance,
      })
    }
  }

  return ctx.result
}
