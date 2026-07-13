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
import { saDateISO } from "@/lib/dates"

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

/**
 * Is this deposit row a coherent MOVEMENT of money? Returns the reason it is not, or null.
 *
 * `mapDepositAmount` takes the credit if there is one, otherwise the debit — which means a row carrying BOTH
 * silently drops the debit side. A row reading "credit 1 000,00 / debit 500,00" posts R1 000 into trust and
 * loses the R500 entirely, with nothing said. And a row with NEITHER posts a zero-amount transaction into the
 * trust ledger: a movement of no money, which will sit in the reconciliation forever meaning nothing.
 *
 * Neither can be resolved by guessing. A single line cannot be a credit AND a debit; if the agency's export
 * says it is, one of the two figures is wrong and only they know which.
 */
function depositRowIncoherence(dep: GLDepositTransaction): string | null {
  if (dep.creditCents > 0 && dep.debitCents > 0) {
    return `This row is BOTH a credit of ${(dep.creditCents / 100).toFixed(2)} and a debit of ` +
      `${(dep.debitCents / 100).toFixed(2)}. A single ledger line cannot be both, so one of the two figures ` +
      `is wrong — and taking the credit (as we used to) would silently discard the debit. Not imported.`
  }
  if (dep.creditCents <= 0 && dep.debitCents <= 0) {
    return "This row moves no money — neither a debit nor a credit. A zero-amount trust transaction is not a " +
      "transaction; it would sit in the reconciliation forever, meaning nothing. Not imported."
  }
  return null
}

// ── Duplicate check ────────────────────────────────────────────────────

/**
 * A GL row's IDEMPOTENCY KEY — derived from what the transaction IS, never from when we imported it.
 *
 * The previous guard searched for a trust row whose `created_at` fell within ±3 days of the GL transaction's
 * DATE. But `created_at` is the moment of import, and GL rows are historical by definition — a payment from
 * three weeks ago can never have a `created_at` within three days of itself. The window could not match, so
 * NOTHING was ever deduplicated, and re-running a GL import doubled the agency's entire trust ledger. Not once
 * the calendar drifted; every single time.
 *
 * (It was also wrong in the other direction: two legitimately identical rent payments a day apart would have
 * been collapsed into one, silently losing a real receipt.)
 *
 * So the key is the transaction itself — lease, type, date, amount — written to `reference`, which the trust
 * table already carries. Re-running the same book finds the same key and skips. It is calendar-independent,
 * because idempotence should be a property of the DATA, not of how long the agency waited before pressing the
 * button a second time.
 */
function glReference(leaseId: string, kind: string, date: Date, amountCents: number): string {
  return `GL:${leaseId}:${kind}:${saDateISO(date)}:${amountCents}`
}

async function alreadyImported(
  supabase: SupabaseClient,
  orgId: string,
  reference: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("trust_transactions")
    .select("id")
    .eq("org_id", orgId)          // dedup is within the caller's org — never an existence oracle on another org's ledger
    .eq("reference", reference)
    .limit(1)
  logQueryError("alreadyImported trust_transactions", error)
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

  const reference = glReference(leaseId, "ar", tx.date, tx.amountCents)
  if (await alreadyImported(ctx.supabase, ctx.orgId, reference)) {
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
      reference,
      // ⚠ statementMonth is deliberately NOT set. `idx_trust_txn_one_opening_per_period` is a UNIQUE index on
      // (org_id, statement_month) WHERE is_opening_balance — ONE opening balance per org per month. Stamping
      // each GL row with its own month therefore caps the entire import at one row per month; the money-
      // conservation test caught it instantly (3 payments in one month → 1 landed, 2 silently rejected).
      //
      // Leaving it NULL keeps every row importable (Postgres treats NULLs as distinct in a unique index), which
      // is the behaviour that has always shipped. But it means the CLOSED-PERIOD guard cannot see these rows
      // either — the guard early-returns on a NULL statement_month. Reconciling "many historical GL rows" with
      // "one opening balance per period" is a LEDGER DESIGN question, not something to guess at on a money
      // path. Flagged for a ruling (OUTSTANDING § D-GL-01); the behaviour here is unchanged from what ships.
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

  const incoherent = depositRowIncoherence(dep)
  if (incoherent) {
    ctx.result.errors.push({ description: dep.rawDescription, message: incoherent })
    ctx.result.skipped++
    return
  }

  const amount = mapDepositAmount(dep)
  const reference = glReference(leaseId, dep.type, dep.date, amount)
  if (await alreadyImported(ctx.supabase, ctx.orgId, reference)) {
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
      reference,
      // See the AR path: statementMonth is deliberately unset — one-opening-balance-per-period would cap the
      // import at a single row per month. OUTSTANDING § D-GL-01.
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
