/**
 * lib/trust/sovereignty-vectors.ts — canonical D-TRUST-01 sovereignty test vectors (single source of truth)
 *
 * Auth:   n/a — pure data, imported by the parity checks only.
 * Notes:  ONE definition of the known-bad / known-good rows, consumed by BOTH sides of the
 *         sovereignty guard so they cannot drift (ADDENDUM_TRUST_RPC_ATOMICITY step 0, CD
 *         condition 2): the JS assert (lib/trust/invariants.ts) and the DB trigger
 *         (tr_trust_txn_sovereignty). The rules themselves live in TRUST_ACCOUNT_POSITIONING.md
 *         §3.2 / ADDENDUM_TRUST_RPC_ATOMICITY §2:
 *           Rule 1: source = 'pleks_controlled_account'
 *           Rule 2: direction = 'debit' (outbound) AND initiated_by = 'pleks_system'
 *         Vectors are stated in TABLE terms (direction credit/debit); the JS assert consumes
 *         them via credit→inbound / debit→outbound, mirroring recordTrustTransaction.
 */
export interface SovereigntyVector {
  label: string
  source: "agency_bank" | "tenant_initiated" | "pleks_controlled_account"
  direction: "credit" | "debit"
  initiatedBy: "agent" | "tenant" | "pleks_system"
}

/** Rows the guard MUST reject — both the DB trigger and the JS assert. */
export const SOVEREIGNTY_BAD: readonly SovereigntyVector[] = [
  { label: "Rule 1 — Pleks-controlled account", source: "pleks_controlled_account", direction: "credit", initiatedBy: "agent" },
  { label: "Rule 2 — Pleks-initiated outbound", source: "agency_bank", direction: "debit", initiatedBy: "pleks_system" },
]

/** Rows the guard MUST allow (inbound rent, tenant-initiated, agent-initiated outbound). */
export const SOVEREIGNTY_GOOD: readonly SovereigntyVector[] = [
  { label: "inbound rent (agency / agent)", source: "agency_bank", direction: "credit", initiatedBy: "agent" },
  { label: "tenant-initiated inbound", source: "tenant_initiated", direction: "credit", initiatedBy: "tenant" },
  { label: "agent-initiated outbound", source: "agency_bank", direction: "debit", initiatedBy: "agent" },
]
