/**
 * lib/legal/retention-documentation.ts — F3 public retention-claim SSOT (O-20)
 *
 * Notes:  The public-facing retention CLAIMS that must not silently drift from what the purge crons actually
 *         enforce. scripts/check-retention-claims.mts (a) cross-checks each claim's `period` against the ENFORCED
 *         value in lib/popia/retention.ts (`retentionDisplay`), and (b) asserts the phrase still appears in each
 *         listed public `surface`. Pure data — no server imports, so a public page may reference it directly.
 *         Spec: brief/build/_BUILDS/SPEC_F3_PUBLIC_DOC_EDITS.md §8.
 *
 *         SCOPE: the F3-critical claims where the public period == the raw enforced period EXACTLY. Claims whose
 *         public commitment intentionally differs from raw enforcement are deliberately NOT cross-checked here —
 *         e.g. consent_log is never-erased (retention.ts) but the public commitment is a 10-year ceiling, and
 *         credit_checks is a 12-month raw window vs 5-year active-lease retention. Add such claims with a
 *         presence-only entry (no enforcedCategory) if/when the CI grows to cover them.
 */

export interface RetentionClaim {
  key: string
  label: string
  /** The period phrase the surfaces must state — also parsed for the enforcement cross-check. */
  period: string
  /** The lib/popia/retention.ts DataCategory that ENFORCES this period. The CI asserts it equals `period`. */
  enforcedCategory: string
  /** Repo-relative public files that must state `period` for this claim. */
  surfaces: string[]
}

const PUB = "app/(public)"

export const RETENTION_DOCUMENTATION: readonly RetentionClaim[] = [
  {
    key: "declined_raw_screening",
    label: "Declined-application raw screening data (identity, bank statements, income)",
    period: "90 days",
    enforcedCategory: "rejected_applications",
    surfaces: [
      `${PUB}/credit-check-policy/page.tsx`,
      `${PUB}/paia-manual/page.tsx`,
      `${PUB}/privacy/page.tsx`,
      `${PUB}/definitions/page.tsx`,
    ],
  },
  {
    key: "decision_accountability_record",
    label: "Decision-accountability record (survives the 90-day raw purge)",
    period: "up to 5 years",
    enforcedCategory: "declined_decision_record",
    surfaces: [
      `${PUB}/credit-check-policy/page.tsx`,
      `${PUB}/paia-manual/page.tsx`,
      `${PUB}/privacy/page.tsx`,
    ],
  },
  {
    key: "audit_log",
    label: "Audit log",
    period: "7 years",
    enforcedCategory: "audit_log",
    surfaces: [
      `${PUB}/paia-manual/page.tsx`,
      `${PUB}/definitions/page.tsx`,
      `${PUB}/terms/page.tsx`,
      `${PUB}/popia-register/page.tsx`,
    ],
  },
]
