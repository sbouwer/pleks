/**
 * lib/import/assemble/types.ts — the multi-table assembler's data model (ADDENDUM_21C / 21D)
 *
 * Notes:  The assembler is a PRE-STAGE (D-1): it consumes a relational SET of staged tables and emits the
 *         denormalised per-lease book the hardened `importRunner` already eats — the importer, guards and identity
 *         dedup are untouched. This file is the CONTRACT, and the `HeldLedger` is load-bearing twice over: it is
 *         the assembler's report-honesty ledger (D-4: resolved + held = total, nothing silently dropped) AND it
 *         is what ADDENDUM_21D renders as the migration checklist ("do NOT build a separate checklist engine").
 *         So every hold is structured for rendering: a plain-language reason, a type, and the decisions a user
 *         can take on it. Design it as the output, not as an internal by-product.
 */
import type { ColumnMapping } from "@/lib/import/importRunner"

/**
 * What a staged table IS. `contact`/`lease`/`property`/`deposit`/`lease_parties` are the MRI import sources;
 * `reference_only` is control/reconciliation (GL, trial balance) that never enters the import output;
 * `unclassified`/`ignored` are the 21D user-facing states (pending a decision, or consciously set aside).
 */
export type StagedEntityKind =
  | "lease" // the spine — BillingDetail / RentRoll (keyed by LEA)
  | "contact" // ContactsExport — all party types, sub-keyed by REFERENCE prefix (TEN/ONR/SUP/AGT)
  | "property" // PropertySummary (keyed by PRO)
  | "deposit" // DepositHeld / DepositSummary (keyed by LEA — ORACLE §5 Q1)
  | "lease_parties" // LeaseExpiry — the fuzzy lease→party link ("Name (phone)"), filtered/incomplete
  | "reference_only" // GLByProperty / TrialBalance / VendorGL — control totals, not an import source
  | "unclassified" // 21D: uploaded, not yet placed — a blocking checklist item, never silently dropped
  | "ignored" // 21D: consciously set aside (cover sheet, summary) — a logged choice, never a silent drop

/** One staged table = one file OR one worksheet tab (ADDENDUM_21C §0.3 makes them the same primitive). */
export interface StagedTable {
  /** File name or tab name — what the user sees on the assembly line. */
  name: string
  headers: string[]
  rows: Record<string, string>[]
  kind: StagedEntityKind
  /** The row-key column, if any (e.g. "REFERENCE"). GL reports have none (context is in section breaks). */
  keyColumn?: string
  /** The REFERENCE namespace prefix this table's rows live in (e.g. "LEA", "TEN") — D-5. */
  keyPrefix?: string
}

/**
 * Why a reference could not resolve — the checklist-item TYPE (21D §1). Each maps to a distinct user action.
 *  - `presence`  — a REQUIRED table is absent (upload it).                        → decision: upload
 *  - `reference` — a keyed edge points at a row that does not exist (dangling FK) → decision: upload / accept-held / exclude
 *  - `fuzzy`     — a display-string edge matched 0 or 2+ candidates (ambiguous)   → decision: confirm-fuzzy / accept-held / exclude
 */
export type HoldKind = "presence" | "reference" | "fuzzy"

/** A resolution a user can take on a hold (21D §4 completion gate). */
export type HoldDecision = "upload_table" | "confirm_fuzzy" | "accept_as_held" | "exclude"

/** A candidate for a `fuzzy` hold's confirm-step (the identity-dedup confirm UI, reused). */
export interface HoldCandidate {
  /** The staged contact's own reference (e.g. "TEN000001"). */
  ref: string
  /** What the user reads: "Donovan Edward Farao · donnie@… · 071 978 0357". */
  label: string
  confidence: number
}

/** One unresolved thing — a checklist item. Structured so 21D can render it without re-deriving anything. */
export interface Hold {
  kind: HoldKind
  /** What is held — a lease ref ("LEA000002"), a required entity ("tenant list"), an edge. */
  subject: string
  /** Plain language, ready to show. "Lease LEA000002 references a tenant we could not find in any uploaded list." */
  reason: string
  /** For a `fuzzy` hold: the candidates the user chooses between (may be empty = no candidate at all). */
  candidates?: HoldCandidate[]
  /** The actions offered for this hold, most-preferred first. */
  decisions: HoldDecision[]
}

/**
 * The held/orphan ledger — the assembler's report-honesty proof AND 21D's checklist. The invariant
 * `resolved + held = total` holds per reference class (D-4); `missingRequired` drives 21D's presence checklist.
 */
export interface HeldLedger {
  holds: Hold[]
  /** References that resolved deterministically or by a confident fuzzy match. */
  resolved: number
  /** References that could not resolve (== holds that are `reference`/`fuzzy`). */
  held: number
  /** resolved + held — every reference accounted for; nothing silently dropped. */
  total: number
  /** Required manifest entities (D-2) with no table present — the presence half of 21D's two-tier completion. */
  missingRequired: string[]
}

/**
 * The assembler's output: the denormalised rows the importer eats, keyed by CANONICAL field names (so the
 * mapping is a trivial identity map — no matchColumns round-trip), plus the ledger. Rows are a MIX of full-lease
 * rows (blank `__entity_type` → importer creates property+unit+tenant+lease) and standalone contact rows
 * (`__entity_type` set → vendor/agent/landlord), all in one array the importer routes in a single call.
 */
export interface AssembledBook {
  rows: Record<string, string>[]
  mapping: ColumnMapping
  ledger: HeldLedger
}
