# TRUST_ACCOUNT_POSITIONING.md
# The Pleks Sovereign Trust Account Doctrine

> **Required reading before any trust-related work.** This document defines the load-bearing
> architectural invariant for the Pleks financial layer. It is not marketing copy — it is
> enforceable doctrine backed by schema, code, and ESLint.

---

## 1. The invariant

Pleks operates as a **trust account management layer** — not as a trustee.

Three properties define this:

1. Pleks **never** holds client funds in a Pleks-controlled bank account.
2. Pleks **never** initiates a payment from any agency bank account.
3. Pleks **does** read from agency bank accounts (via OFX/CSV upload or Yodlee read-only feed)
   and produces reconciliation artefacts and audit exports.

This is not a preference. It is the load-bearing architectural decision that makes Pleks's
pricing and competitive positioning defensible. Erosion of this invariant — even a "convenient"
exception — would transform Pleks into a trustee under the PPA, exposing the business to
the same regulatory and liability surface as the competition, and destroying the price moat.

**Architectural codename:** D-TRUST-01 (see `brief/build/BUILD_64_SOVEREIGN_TRUST_ACCOUNT.md §4`)

---

## 2. Legal foundation

### 2.1 Property Practitioners Act 22 of 2019 (PPA)

- **Section 54:** Fidelity Fund Certificates are issued to estate agencies and individual agents.
  An FFC is not transferable to a software platform.
- **Section 86:** Every estate agency handling client funds must hold and administer those funds
  in a Section 86 trust account in the agency's own name.
- **Implication:** The PPA framework presupposes that the agency is the trustee. A software
  platform acting as trustee on behalf of multiple agencies would need its own separate regulatory
  authorisation — which Pleks neither has nor seeks.

### 2.2 Estate Agency Affairs Act 112 of 1976 (EAA Act — still operative in transitional provisions)

- **Section 32:** Lays out trustee duties and liabilities for estate agents holding client funds.
  A trustee bears personal professional-liability for any shortfall.
- **Implication:** By never becoming the trustee, Pleks has zero exposure under s32. The agency
  principal who signs off the monthly reconciliation bears the professional-liability; Pleks
  provides the tools to do so accurately.

### 2.3 JSE Trust Accounts Rules (analogous regulatory context)

The JSE Trust Accounts Rules (for JSE-regulated entities) establish the general principle that
client funds must be held in named trust accounts for the benefit of clients. While Pleks's
customers are not JSE-regulated, the same principle applies under PPA s86. The pattern of
"management software reading a trust account" without taking custody is well-established in the
conveyancing, bond origination, and attorney trust-account software space (Ghostpractice,
LexisNexis PracticeManagement) — none of these are trustees.

### 2.4 POPIA considerations

Trust account data contains personal information (tenant names, deposit amounts, landlord
identities). The processing purpose for trust reconciliation data is:

- **Purpose:** `trust_reconciliation` — monthly close and regulatory audit of the agency's
  Section 86 trust account, generation of PPRA audit exports
- **Retention:** Indefinite for closed-period records (PPRA audit evidence); standard 5-year
  minimum per PPRA rules
- **Access:** Agent-side only; landlord portal shows per-landlord deposit aggregates only
- **Documented in:** `brief/legal/PROCESSING_PURPOSES.md`

---

## 3. Enforcement mechanisms

Three layers make the invariant structurally hard to violate by accident.

### 3.1 Schema level

The `bank_accounts` table has a `type` CHECK constraint. No `pleks_trust` type exists and
none may be added without amending the constraint. The `org_id` column on every bank account
row refers to an agency org — there is no Pleks-internal org that could hold funds. The
COMMENT on `bank_accounts` records this doctrine explicitly.

```sql
COMMENT ON TABLE bank_accounts IS
  'Bank accounts owned and controlled by the agency (org_id). Pleks reads from '
  'these via BUILD_50 substrate; Pleks never initiates payments from them. '
  'No row in this table is Pleks-controlled. See brief/legal/TRUST_ACCOUNT_POSITIONING.md.';
```

### 3.2 Code level — `lib/trust/invariants.ts`

Every trust-related operation must call `assertPleksIsNotTrustee()`. The function throws
`SovereignTrustViolation` (which also fires to Sentry with `tags: { invariant: 'trust_sovereignty' }`)
if any of three rules are violated:

- **Rule 1:** `source === 'pleks_controlled_account'` → VIOLATION (no such account exists)
- **Rule 2:** `direction === 'outbound' && initiatedBy === 'pleks_system'` → VIOLATION
- **Rule 3:** `initiatedBy === 'debicheck_peach' && direction !== 'inbound'` → VIOLATION

Any `SovereignTrustViolation` in production is a critical bug. Sentry alert is set to page oncall immediately.

### 3.3 ESLint level — `no-restricted-imports`

`eslint.config.mjs` contains a rule that blocks any import of SA bank payment-initiation
packages (`@stitch-money/*`, `ozow-sdk`, `snapscan*`, `@absa/banking-api`, `@standard-bank/payment-api`)
from any file outside the DebiCheck allowlist. The rule message links to this document.

If you genuinely need to add a payment-initiation integration, the process is:
1. Write a spec addendum explaining the use case and why it does not violate D-TRUST-01
2. Get the addendum reviewed and approved before opening a PR
3. The PR must extend the ESLint allowlist with an explicit justification comment

---

## 4. DebiCheck as the narrow exception

DebiCheck (BUILD_10) collects rent *into* the agency's trust account via Peach Payments.

This is not a violation because:
- Direction: **inbound** (tenant → agency trust account). Never outbound.
- Authorisation: Per mandate signed by the tenant at their bank. Not by Pleks.
- Execution: By Peach Payments and the clearing banks. Pleks triggers the collection request
  via Peach's API but does not hold or move funds.

The invariant explicitly allows `direction: 'inbound'` operations. The ESLint rule excludes
`lib/debicheck/**` from the payment-initiation package block.

Future developers: DebiCheck is the **only** narrow exception. Adding a new inbound-only
collection rail requires the same spec-addendum process described in §3.3.

---

## 5. The monthly close as the trust accountability moment

The trust reconciliation close is where the agency's professional liability crystallises.
The agent (or their accountant) who clicks "Sign off and close":

- Takes professional responsibility for the three-balance comparison
- Acknowledges any variance in writing
- Creates an immutable signed record that will be presented to the PPRA auditor

Pleks's role is to make this moment *accurate* (by reconciling bank statement to ledger) and
*auditable* (by generating the PPRA-format export bundle). The responsibility stays with the
agent. This is by design.

The DB trigger `tr_trust_txn_period_check` enforces immutability of trust_transactions in
closed periods at the database level — not just at the application level. Any future policy
change that accidentally allows writes to closed-period rows will be blocked by the trigger.

---

## 6. The competitive moat explained

The dominant SA competitor (unnamed per legal safety policy) operates a forced-trusteeship
model: agencies use the competitor's trust account; the competitor is the legal trustee;
agencies operate on a sub-ledger. This has real costs:

- Agencies lose fiduciary sovereignty
- The competitor charges a custody fee (explaining ~40–50% of the price gap)
- Exit is expensive: migrating thousands of tenant deposits is months of work
- Single-point-of-failure: a problem at the competitor's trust account affects all customers simultaneously

The Pleks sovereign model inverts this:
- Agency keeps their trust account → zero exit cost, zero single-point-of-failure
- Pleks provides observability + audit + reconciliation without custody → no custody fee
- The price gap is real and defensible: Pleks is not funding a trust-audit-compliance engine
  spread across custodial funds

The marketing page at `/for-agents/trust-account` communicates this to prospects. The landlord
portal at `/landlord/trust-summary` makes it visible to landlords. The admin `/admin/trust-health`
makes it visible internally for customer success operations.

---

## 7. How to propose a future exception

If a future product decision appears to require Pleks to hold funds, initiate payments, or
become a trustee in any form:

1. **Stop.** Do not implement without going through this process.
2. Write a spec addendum specifically analysing whether the proposed feature violates D-TRUST-01.
3. The analysis must include:
   - Which rule in §3.2 (if any) would be violated
   - Why the violation is necessary
   - What regulatory authorisation Pleks would need to acquire
   - What the competitive positioning impact would be
4. The addendum must be reviewed by a director before implementation begins.
5. If approved, the ESLint allowlist must be extended with an explicit comment citing the
   approved addendum.

There is no shortcut around this process. The moat is only as strong as the discipline to maintain it.

---

## 8. New developer checklist

Before writing any trust-related code:

- [ ] Read this document (you are here)
- [ ] Read `brief/build/BUILD_64_SOVEREIGN_TRUST_ACCOUNT.md` — the full design spec
- [ ] Understand `lib/trust/invariants.ts` — the runtime enforcement
- [ ] Understand `lib/trust/close.ts` — the period-close server action
- [ ] Understand `lib/trust/audit-export.ts` — the audit bundle generator
- [ ] Confirm your proposed operation passes `assertPleksIsNotTrustee()` before writing the code
- [ ] If it doesn't pass: follow the exception process in §7, not the workaround

---

*Maintained by: the Pleks engineering team*
*Last updated: 2026-05-12*
*Doctrine version: 1.0*
