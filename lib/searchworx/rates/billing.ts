/**
 * lib/searchworx/rates/billing.ts — billing-report rows → rate observations (ADDENDUM_14V §3.2, §3.2b)
 *
 * Data:   none — pure. Input is the unread rows of /billingreports/company/ for one day.
 * Notes:  POPIA (§3.2b): Description carries the search subject's ID or registration number. Nothing here
 *         spreads a row; every observation field is copied BY NAME, and Description, User and BranchName are
 *         never read. A test asserts no Description value survives into the output.
 *         Name mapping (ruled 2026-10-01): the billing SearchType is the vendor's authoritative name and the
 *         price-list name is a key into it. The two differ only in case (UAT, 2026-10-01: "CIPC Company" billed,
 *         "CIPC COMPANY" listed), so billing names are matched case-insensitively against VENDOR_NAME_TO_PRODUCT.
 *         A billed observation is `exact` whatever the list entry's confidence — the billing row IS the
 *         confirmation that flips an inferred mapping. A billing name the table does not know is reported,
 *         never guessed; adding it to productNames.ts is the "replace the key" step of the ruling.
 *         The rate is UnitPrice (per unit), not Cost: only Quantity 1 has been observed, so Cost = Q × UnitPrice
 *         is an assumption this does not need to make.
 *         A row that cannot be read (missing field, unparseable price, bad date) is REJECTED. The cron treats
 *         any rejection as a source failure: a reshaped report must be seen, not half-recorded (§9.2).
 *         Idempotency: each observation carries raw.billing_key (bill timestamp | search type | reference, with
 *         an ordinal for exact repeats in the same fetch), so a re-run of the same day records nothing twice.
 */
import type { Observation } from "@/lib/searchworx/rates/observe"
import { priceToCents } from "@/lib/searchworx/rates/priceList"
import { VENDOR_NAME_TO_PRODUCT } from "@/lib/searchworx/rates/productNames"

export interface BillingObservations {
  observations: Observation[]
  /** Distinct billing names with no product_key. Product names only — never subject data. */
  unmapped: string[]
  rejected: { index: number; reason: string }[]
}

const BILL_DATE = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/
const QUANTITY = /^\d{1,4}$/

const BY_UPPER_NAME = new Map(Object.entries(VENDOR_NAME_TO_PRODUCT).map(([name, v]) => [name.toUpperCase(), v]))

function field(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  return typeof v === "string" ? v.trim() : null
}

export function billingObservations(rows: readonly unknown[], fetchedDay: string): BillingObservations {
  const out: BillingObservations = { observations: [], unmapped: [], rejected: [] }
  const unmapped = new Set<string>()
  const seen = new Map<string, number>()

  rows.forEach((r, index) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      out.rejected.push({ index, reason: "row is not an object" })
      return
    }
    const row = r as Record<string, unknown>
    const searchType = field(row, "SearchType")
    const billDate = field(row, "BillDate")
    const unitPrice = field(row, "UnitPrice")
    const quantity = field(row, "Quantity")
    const reference = field(row, "Reference") ?? ""
    if (!searchType || !billDate || unitPrice === null || quantity === null) {
      out.rejected.push({ index, reason: "missing SearchType, BillDate, UnitPrice or Quantity" })
      return
    }
    const date = BILL_DATE.exec(billDate)?.[1]
    if (!date) {
      out.rejected.push({ index, reason: "BillDate is not yyyy-MM-dd HH:mm" })
      return
    }
    const cents = priceToCents(unitPrice)
    if (cents === null) {
      out.rejected.push({ index, reason: "UnitPrice is not a rand amount" })
      return
    }
    if (!QUANTITY.test(quantity) || Number(quantity) < 1) {
      out.rejected.push({ index, reason: "Quantity is not a positive whole number" })
      return
    }

    const mapped = BY_UPPER_NAME.get(searchType.toUpperCase())
    if (!mapped) {
      unmapped.add(searchType)
      return
    }

    const base = `${billDate}|${searchType}|${reference}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)

    out.observations.push({
      productKey: mapped.productKey,
      costExclVatCents: cents,
      source: "billing_report",
      sourceRef: reference || `billing:${billDate}`,
      mappingConfidence: "exact",
      vendorEffectiveDate: date,
      raw: {
        billing_key: n === 1 ? base : `${base}#${n}`,
        bill_day: fetchedDay,
        bill_date: billDate,
        search_type: searchType,
        quantity: Number(quantity),
      },
    })
  })

  out.unmapped = [...unmapped].sort((a, b) => a.localeCompare(b))
  return out
}
