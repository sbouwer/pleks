---
paths:
  - "lib/trust/**"
  - "lib/recon/**"
  - "lib/statements/**"
  - "lib/deposits/**"
  - "lib/finance/**"
  - "lib/payfast/**"
---

## TRUST ACCOUNT — REQUIRED READING

**Before any trust-related work, read `brief/legal/TRUST_ACCOUNT_POSITIONING.md`.**

This is non-negotiable. The document defines the load-bearing architectural invariant
(D-TRUST-01: Pleks is not the trustee) enforced at schema, code, and ESLint levels.
The new developer checklist is in §8 of that document.
**UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: money) — related to `CLAUDE.md`'s debit-order/DebiCheck DO-NOT-DO rule (same underlying ESLint control, different rule statement — not a full twin). PARTIAL. The ESLint layer is real: `eslint.config.mjs`'s `no-restricted-imports` block forbids `@stitch-money/*`/`ozow-sdk`/`snapscan*`/`@absa/banking-api`/`@standard-bank/payment-api` repo-wide, citing D-TRUST-01 by name. (Note: `eslint:no-restricted-imports` DOES resolve under the fixed marker resolver since the string is literally quoted — the "can't be expressed under the grammar" framing is stale; tagging it `@enforced` here would still overclaim, since this sentence bundles a broader "schema, code, AND ESLint" enforcement claim, and only the ESLint layer was verified in this pass.) The "schema" and "code" enforcement layers this sentence also claims were not independently verified in this pass — flagged rather than tagged, per "do not invent controls." Sketch: independently verify (or build) the schema- and code-layer controls the sentence claims, then tag each verified layer separately rather than the compound claim as one.

---

