/**
 * lib/trust/__tests__/sovereignty-parity.test.ts — JS half of the D-TRUST-01 parity check
 *
 * Feeds the SHARED sovereignty vectors (sovereignty-vectors.ts) to the JS assert. The DB half
 * (scripts/security/trust-sovereignty-parity.mts) feeds the SAME vectors to the tr_trust_txn_sovereignty
 * trigger — one vector set, both layers, so the trigger and the JS mirror can never silently diverge
 * (ADDENDUM_TRUST_RPC_ATOMICITY step 0, CD condition 2).
 */
import { describe, it, expect } from "vitest"
import { assertPleksIsNotTrustee } from "@/lib/trust/invariants"
import { SOVEREIGNTY_BAD, SOVEREIGNTY_GOOD, type SovereigntyVector } from "@/lib/trust/sovereignty-vectors"

// Map a table-shaped vector to the assert's operation shape (credit→inbound, debit→outbound).
function op(v: SovereigntyVector) {
  return {
    orgId: "00000000-0000-0000-0000-000000000000",
    direction: (v.direction === "credit" ? "inbound" : "outbound") as "inbound" | "outbound",
    source: v.source,
    initiatedBy: v.initiatedBy,
    amountCents: 1,
    description: v.label,
  }
}

describe("D-TRUST-01 JS assert (mirror of the tr_trust_txn_sovereignty DB trigger)", () => {
  it.each(SOVEREIGNTY_BAD)("rejects $label", (v) => {
    expect(() => assertPleksIsNotTrustee(op(v))).toThrow(/SOVEREIGN_TRUST_VIOLATION/)
  })

  it.each(SOVEREIGNTY_GOOD)("allows $label", (v) => {
    expect(() => assertPleksIsNotTrustee(op(v))).not.toThrow()
  })
})
