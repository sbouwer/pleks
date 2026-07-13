/**
 * lib/import/recovery.ts — an import that died on a dropped connection retries itself, ONCE, and says so
 *
 * Notes:  There is no wrapping transaction around an import (a 5 000-row book cannot be one), so a connection
 *         that drops mid-run leaves the book HALF-WRITTEN. The agency sees a partial import and a page full of
 *         errors that say nothing they can act on — "Insert failed: fetch failed" is not a data problem they can
 *         fix by editing their spreadsheet.
 *
 *         Re-running is the right answer, and we can do it for them because CONVERGENCE IS PROVEN
 *         (test/db/import-crash.dbtest.ts: kill the import at any depth, re-run, and the database ends up
 *         exactly where a single clean run would have left it). That proof is what makes this safe. Without it,
 *         an automatic retry is how you double an agency's book.
 *
 *         THE DISTINCTION THAT MAKES IT WORK — and the reason this is not just `catch { retry }`:
 *
 *           INFRASTRUCTURE   the connection dropped, the socket hung up, the query timed out. Nothing about the
 *                            agency's data is wrong. Retrying costs nothing and will very likely work.
 *           DATA             the rent is negative; the lease ends before it starts; the ID fails its checksum.
 *                            Retrying changes NOTHING — the same row will be refused for the same reason, and
 *                            a retry loop here would just be a slower way to produce the same report.
 *
 *         Retry the first. Never retry the second. A retry that cannot distinguish them is a machine for
 *         doing the wrong thing twice as fast.
 *
 *         ONCE. Not "until it works" — a genuinely dead database would retry forever, and the agency would sit
 *         watching a spinner instead of being told the truth. One retry, then report honestly what happened.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  runImport, type ColumnMapping, type ImportDecisions, type ImportResult, type ImportError,
} from "./importRunner"

/**
 * Does this error message describe the PLUMBING failing, rather than the DATA being wrong?
 *
 * Deliberately conservative. A message we cannot confidently place is treated as a DATA problem — because
 * mistaking a data error for an infrastructure one causes a pointless retry (cheap), while mistaking an
 * infrastructure error for a data one causes us to tell an agency their spreadsheet is broken when their
 * network hiccuped (expensive, and insulting).
 */
export function isInfrastructureFailure(message: string): boolean {
  return /fetch failed|econnreset|econnrefused|etimedout|socket hang up|network|connection (?:lost|closed|reset|terminated)|terminating connection|server closed|timeout|timed out|502|503|504/i
    .test(message)
}

export interface RecoveredImportResult extends ImportResult {
  /** True when the first attempt died on the plumbing and we ran it again. */
  autoRetried: boolean
}

/** The counts an agency actually cares about: how much of their book now EXISTS, across both attempts. */
function mergeCounts(first: ImportResult, second: ImportResult): ImportResult {
  // Created counts SUM: the second run only creates what the first one never got to, so first + second is the
  // whole book. (Skipped/error counts come from the SECOND run alone — the first run's transport failures have
  // been resolved by the retry and reporting them would be telling the agency about a problem that no longer
  // exists.)
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
  }
}

/**
 * Run an import. If it dies on the plumbing, run it again — once — and tell the agency plainly what happened.
 */
export async function runImportWithRecovery(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  decisions: ImportDecisions,
  orgId: string,
  agentId: string,
  importSessionId: string | undefined,
  supabase: SupabaseClient,
): Promise<RecoveredImportResult> {
  const first = await runImport(rows, mapping, decisions, orgId, agentId, importSessionId, supabase)

  const infrastructure = (first.errors as ImportError[]).filter(
    (e) => e.severity === "error" && isInfrastructureFailure(e.message),
  )
  if (infrastructure.length === 0) {
    return { ...first, autoRetried: false }
  }

  // The connection dropped. Re-run: the import is idempotent by construction (properties, units and tenants
  // upsert; leases are keyed on their unit), and crash-convergence is proven, so the second pass fills in
  // exactly what the first one never wrote and touches nothing it did.
  const second = await runImport(rows, mapping, decisions, orgId, agentId, importSessionId, supabase)

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
      message: stillBroken.length > 0
        ? `The connection to the database failed partway through your import, and it failed again when we ` +
          `automatically tried a second time. Some of your book was imported and some was not — nothing is ` +
          `duplicated, and it is safe to press Import again once the connection is stable. ` +
          `${stillBroken.length} row(s) are still affected.`
        : `The connection to the database dropped partway through your import (${infrastructure.length} ` +
          `row(s) affected). We ran it again automatically and the rest of your book imported successfully. ` +
          `Nothing was duplicated. No action is needed — this message is here so you know it happened.`,
    },
    // The retry's own report — data problems the agency does need to act on. The first attempt's transport
    // errors are deliberately dropped: they described a problem that no longer exists, and leaving them in
    // would bury the real findings under noise about a network blip we already fixed.
    ...second.errors,
  ]

  return merged
}
