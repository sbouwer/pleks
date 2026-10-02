/**
 * lib/searchworx/billingReport.ts — fetch one day of the account's billed Searchworx searches (ADDENDUM_14V §3.2)
 *
 * Auth:   the shared Searchworx session (lib/searchworx/client.ts)
 * Data:   POST /billingreports/company/ { SessionToken, DateFrom, DateTo } (dd/MM/yyyy) — the vendor's own
 *         statement of what each search cost
 * Notes:  Returns the rows UNREAD: every row's Description carries the search subject's ID or registration
 *         number (POPIA, §3.2b), so the only consumer is the pure mapper in rates/billing.ts, which copies named
 *         fields and never Description. A quiet day is `ok` with no rows, not a failure (acceptEmptyList); a
 *         vendor "no records" message is read the same way. Anything else is a source failure for the cron.
 *         Shape learned from the 2026-10-01 UAT spike (.handoff/14v-rate-engine/06-uat-spike.md) — no sample is
 *         documented by the vendor, which is why the mapper rejects a row it cannot read rather than guess.
 */
import { searchworxCall } from "./client"

export type BillingFetch = { ok: true; rows: unknown[] } | { ok: false; error: string }

/** YYYY-MM-DD → dd/MM/yyyy, the vendor's date format. */
function vendorDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export async function fetchBillingReport(dayISO: string): Promise<BillingFetch> {
  const day = vendorDate(dayISO)
  try {
    const res = await searchworxCall<unknown[]>({
      productPath: "billingreports/company",
      buildBody: (token) => ({ SessionToken: token, DateFrom: day, DateTo: day }),
      acceptEmptyList: true,
      // Runs serially inside the daily orchestrator (maxDuration 90s); the client's 60s default could eat it.
      timeout_ms: 20_000,
    })
    if (res.ok) return { ok: true, rows: Array.isArray(res.data) ? res.data : [] }
    if (res.error.category === "no_data") return { ok: true, rows: [] }
    return { ok: false, error: res.error.message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
