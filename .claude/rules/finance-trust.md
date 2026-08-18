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
**UNENFORCEABLE** — "read the doc first" leaves no artefact; only the invariant it describes is checkable, below.

This is non-negotiable. The document defines the load-bearing architectural invariant
(D-TRUST-01: Pleks is not the trustee) enforced at schema, code, and ESLint levels.
The new developer checklist is in §8 of that document.
**UNENFORCEABLE** — PARTIAL. The ESLint layer is real: `eslint.config.mjs`'s `no-restricted-imports` block forbids `@stitch-money/*`/`ozow-sdk`/`snapscan*`/`@absa/banking-api`/`@standard-bank/payment-api` repo-wide, citing D-TRUST-01 by name — but, like the debit-order rule in CLAUDE.md's DO NOT DO, it is a built-in `no-restricted-imports` config rather than a `pleks/*` rule in `eslint-rules/`, so it can't be expressed under the current `eslint:` (pleks-only) marker grammar. The "schema" and "code" enforcement layers this sentence also claims were not independently verified in this pass — flagged rather than tagged, per "do not invent controls."

---

