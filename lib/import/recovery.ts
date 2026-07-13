/**
 * lib/import/recovery.ts — an import that died on a dropped connection retries itself, ONCE, and says so
 *
 * Notes:  There is no wrapping transaction around an import (a 5 000-row book cannot be one), so a connection
 *         that drops mid-run leaves the book HALF-WRITTEN. The agency sees a partial import and a page of
 *         "Insert failed: fetch failed" — which is not a data problem they can fix by editing their spreadsheet,
 *         and not something they should have to diagnose.
 *
 *         Re-running is the right answer, and we can do it FOR them because CONVERGENCE IS PROVEN
 *         (test/db/import-crash.dbtest.ts, and — since the pre-PR walk — under READ failure too, which is the
 *         case that actually matters here: see below). Without that proof, an automatic retry is how you double
 *         an agency's book.
 *
 *         THE DISTINCTION THAT MAKES IT WORK, and the reason this is not just `catch { retry }`:
 *
 *           INFRASTRUCTURE   the socket hung up, the query timed out, the connection reset. Nothing about the
 *                            agency's data is wrong. Retrying costs nothing and will very likely work.
 *           DATA             the rent is negative; the lease ends before it starts; the ID fails its checksum.
 *                            Retrying changes NOTHING — the same row is refused for the same reason.
 *
 *         Retry the first. Never the second. A retry that cannot tell them apart is a machine for doing the
 *         wrong thing twice as fast.
 *
 *         ⚠ WHY THE DEDUP GUARDS HAD TO FAIL CLOSED FIRST. A dropped connection fails SELECTs, not only
 *         INSERTs. Every "does this already exist?" guard in the importer is a SELECT, and they used to treat a
 *         query ERROR as "not found" and insert anyway. So this retry — which by design runs at the exact moment
 *         the database is flapping — would have re-run the book, had a dedup lookup error, fallen open, and
 *         created a SECOND active lease on the same unit. postOpeningDeposit keys on lease_id, so that is a
 *         SECOND opening balance in the TRUST LEDGER: the agency's trust account over-stating money it holds for
 *         other people. The retry would have been a duplication engine. The guards now throw
 *         (`assertLookupOk`), and this is safe. My original proof missed it because the crash client only ever
 *         failed writes; the pre-PR walk caught it.
 *
 *         ONCE. Not "until it works" — a genuinely dead database would retry forever while the agency watched a
 *         spinner instead of being told the truth. One retry, then an honest report either way.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  runImport, type ColumnMapping, type ImportDecisions, type ImportResult, type ImportError,
} from "./importRunner"

/**
 * Does this error message describe the PLUMBING failing, rather than the DATA being wrong?
 *
 * Deliberately conservative. A message we cannot confidently place is treated as a DATA problem — because
 * mistaking data for infrastructure costs one pointless retry (cheap), while mistaking infrastructure for data
 * means telling an agency their spreadsheet is broken when their network hiccuped (expensive, and insulting).
 */
export function isInfrastructureFailure(message: string): boolean {
  return /fetch failed|econnreset|econnrefused|etimedout|socket hang up|network|connection (?:lost|closed|reset|terminated)|terminating connection|server closed|timeout|timed out|502|503|504/i
    .test(message)
}

export interface RecoveredImportResult extends ImportResult {
  /** True when the first attempt died on the plumbing and we ran it again. */
  autoRetried: boolean
}

interface RunArgs {
  rows: Record<string, string>[]
  mapping: ColumnMapping
  decisions: ImportDecisions
  orgId: string
  agentId: string
  importSessionId: string | undefined
  supabase: SupabaseClient
}

const run = (a: RunArgs) =>
  runImport(a.rows, a.mapping, a.decisions, a.orgId, a.agentId, a.importSessionId, a.supabase)

/** What the first attempt "produced" when it died outright, before returning anything at all. */
function emptyResult(): ImportResult {
  return {
    propertiesCreated: 0, unitsCreated: 0, tenantsCreated: 0, leasesCreated: 0, historyCreated: 0,
    notesCreated: 0, contractorsCreated: 0, landlordsImported: 0, landlordsLinked: 0, agentInvitesSent: 0,
    bankAccountsImported: 0, depositsMigratedCents: 0, skipped: 0, errors: [],
    pendingLandlordLinks: [], agentInvites: [], identityHolds: [],
  }
}

/**
 * The counts an agency actually cares about: how much of their book now EXISTS, across both attempts.
 *
 * CREATED counts SUM — the second run only creates what the first never got to, so first + second is the whole
 * book. SKIPPED comes from the FIRST run, not the second: run 2 counts everything run 1 successfully created as
 * a dedup "skip", so reporting run 2's number would tell an agency that rows were skipped when in fact they
 * landed. ("6 leases created, 2 skipped" for a 6-row book is not a report, it is a riddle.)
 */
function mergeCounts(first: ImportResult, second: ImportResult): ImportResult {
  return {
    ...second,
    propertiesCreated: first.propertiesCreated + second.propertiesCreated,
    unitsCreated: first.unitsCreated + second.unitsCreated,
    tenantsCreated: first.tenantsCreated + second.tenantsCreated,
    leasesCreated: first.leasesCreated + second.leasesCreated,
    historyCreated: first.historyCreated + second.historyCreated,
    notesCreated: first.notesCreated + second.notesCreated,
    contractorsCreated: first.contractorsCreated + second.contractorsCreated,
    landlordsImported: first.landlordsImported + second.landlordsImported,
    landlordsLinked: first.landlordsLinked + second.landlordsLinked,
    agentInvitesSent: first.agentInvitesSent + second.agentInvitesSent,
    bankAccountsImported: first.bankAccountsImported + second.bankAccountsImported,
    depositsMigratedCents: first.depositsMigratedCents + second.depositsMigratedCents,
    skipped: first.skipped,
    // These are LISTS the agency acts on (a landlord to invite, an agent to confirm), not counters. Taking the
    // second run's alone would silently drop everything the FIRST run surfaced before the connection died.
    pendingLandlordLinks: [...first.pendingLandlordLinks, ...second.pendingLandlordLinks],
    agentInvites: [...first.agentInvites, ...second.agentInvites],
    // A hold is a QUESTION the agency must answer. Taking only the second run's would silently drop the ones
    // the first run raised before the connection died — and a question nobody sees is a row nobody imports.
    identityHolds: [...first.identityHolds, ...second.identityHolds],
  }
}

/**
 * The retry is a full SECOND pass over the book, so it roughly DOUBLES the wall-clock — and the import route
 * has a hard 300s ceiling (~93 ms/lease, so ~3 000 leases). A retry that cannot finish inside what is left does
 * not help the agency: the platform kills the function mid-retry, the catch block never runs, the import_session
 * is never marked failed, and they lose the entire report even though the first run's rows are committed. The
 * recovery would have turned "a slow import that reports" into "a silent kill that does not".
 *
 * So the retry is only attempted when there is plausibly room for it. When there is not, we do not retry — we
 * tell them the truth and let them press the button, which is safe (the import is idempotent, the dedup guards
 * fail closed, and convergence is proven). Doing nothing and saying so beats doing something that cannot finish.
 */
const BUDGET_MS = 240_000        // of the route's 300s, leaving headroom to report

const RECOVERED =
  "The connection to the database dropped partway through your import. We ran it again automatically and the " +
  "rest of your book imported successfully. Nothing was duplicated. No action is needed — this message is " +
  "here so that you know it happened."

const STILL_BROKEN =
  "The connection to the database failed partway through your import, and it failed again when we " +
  "automatically tried a second time. Some of your book was imported and some was not. Nothing is duplicated, " +
  "and it is safe to press Import again once the connection is stable."

/** Run an import. If it dies on the plumbing, run it again — once — and tell the agency plainly what happened. */
export async function runImportWithRecovery(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  decisions: ImportDecisions,
  orgId: string,
  agentId: string,
  importSessionId: string | undefined,
  supabase: SupabaseClient,
): Promise<RecoveredImportResult> {
  const args: RunArgs = { rows, mapping, decisions, orgId, agentId, importSessionId, supabase }
  const startedAt = performance.now()

  // An import can die in TWO ways, and both of them are the plumbing:
  //   per-row   the runner catches the dead connection, records it against the row, and carries on.
  //   outright  the connection dies somewhere with no row-level catch — a dedup LOOKUP, for instance, which now
  //             THROWS rather than falling open — and the exception escapes runImport altogether.
  // The first version handled only the per-row case, so an outright transport death propagated out of here and
  // the agency got a 500 with no report at all: no retry, no explanation, and no way to know a re-run was safe.
  // To the agency they are the same event. Treat them the same.
  let first: ImportResult
  try {
    first = await run(args)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isInfrastructureFailure(message)) throw e      // a real bug — never paper over it with a retry
    if (!roomToRetry(startedAt)) return outOfTime(emptyResult())
    return retryOnce(args, emptyResult())
  }

  const infrastructure = (first.errors as ImportError[]).filter(
    (e) => e.severity === "error" && isInfrastructureFailure(e.message),
  )
  if (infrastructure.length === 0) return { ...first, autoRetried: false }

  if (!roomToRetry(startedAt)) return outOfTime(first)
  return retryOnce(args, first)
}

/** Is there time for a second full pass before the platform kills the function? */
function roomToRetry(startedAt: number): boolean {
  const elapsed = performance.now() - startedAt
  return elapsed * 2 < BUDGET_MS
}

/** No room for a retry. Report honestly — a re-run by hand is safe, and saying so is worth more than a retry
 *  that gets killed halfway and takes the whole report down with it. */
function outOfTime(first: ImportResult): RecoveredImportResult {
  return {
    ...first,
    autoRetried: false,
    errors: [
      {
        rowIndex: -1,
        field: "",
        severity: "error",
        message:
          "The connection to the database dropped partway through your import. Your book is large enough that " +
          "re-running it automatically would not have finished in time, so we have not tried. Nothing is " +
          "duplicated, and it is safe to press Import again — it will pick up exactly what is missing.",
      },
      ...first.errors,
    ],
  }
}

async function retryOnce(args: RunArgs, first: ImportResult): Promise<RecoveredImportResult> {
  // The re-run. Idempotent by construction (properties, units and tenants upsert; leases are keyed on their
  // unit), and every dedup guard now fails CLOSED, so a lookup that errors refuses the row instead of creating
  // it a second time. That is what makes the second pass safe while the connection is still unstable.
  let second: ImportResult
  try {
    second = await run(args)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isInfrastructureFailure(message)) throw e
    // Dead twice. Report the truth — do not loop.
    const merged = { ...first, autoRetried: true } as RecoveredImportResult
    merged.errors = [
      { rowIndex: -1, field: "", severity: "error", message: STILL_BROKEN },
      ...first.errors,
    ]
    return merged
  }

  const merged = mergeCounts(first, second) as RecoveredImportResult
  merged.autoRetried = true

  const stillBroken = (second.errors as ImportError[]).filter(
    (e) => e.severity === "error" && isInfrastructureFailure(e.message),
  )

  merged.errors = [
    {
      rowIndex: -1,
      field: "",
      severity: stillBroken.length > 0 ? "error" : "warning",
      message: stillBroken.length > 0 ? STILL_BROKEN : RECOVERED,
    },
    // The RETRY's report — the data problems the agency does need to act on. The first attempt's transport
    // errors are deliberately dropped: they described a problem that no longer exists, and leaving them in
    // would bury the real findings under noise about a network blip we have already recovered from.
    ...second.errors,
  ]

  return merged
}
