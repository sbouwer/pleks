# Acceptance-run reconciliation oracle

The hand-built truth the museum import must reconcile against. Derived from the real MRI Rentbook
exports (local-only, gitignored — real SA IDs + names never enter the repo). This file is PII-free
on purpose: references and amounts only.

The oracle is what makes the DB ceremony a *confirmation* rather than a from-scratch reconcile —
the importer's output is asserted against these numbers, not eyeballed.

## Entities the book contains (from `rptContactsExport`)

| MRI ref | TYPE | routes to | note |
|---|---|---|---|
| SUP000001 | vendor | supplier | no ID, no VAT |
| SUP000002 | vendor | supplier | VAT present |
| ONR000001 | landlord | landlord | Twin Peaks owner |
| ONR000002 | landlord | landlord | 6 Boegoe St owner |
| TEN000001 | tenant | tenant | **applicant** — SA ID hash `c07cff59` |
| TEN000002 | tenant | tenant | **active** — SA ID hash `c07cff59` (SAME PERSON) |
| TEN000003 | tenant | tenant | distinct SA ID |
| AGT000001 | agent | invite | IDENTIFIER is a **CIPC**, not an SA ID (see finding) |

### Expected entity counts AFTER identity dedup

- Tenants: **2** (TEN000001 + TEN000002 collapse on `id_number_hash c07cff59` → one person)
- Landlords: **2**
- Suppliers: **2**
- Agent invites: **1**

The dedup collapse is the headline proof: two MRI tenant records → one Pleks person, on the
deterministic hash key, on real data.

## Leases (from `rptAdmRentbookBillingDetail`)

| ref | property | start | end | rent | status |
|---|---|---|---|---|---|
| LEA000001 | Twin Peaks | 2023/04/01 | 2026/03/31 | 8860 | Active |
| LEA000002 | 6 Boegoe St | 2025/08/01 | 2027/07/31 | 7500 | Active |

- LEA000001's tenant is the ACTIVE record (TEN000002) — after dedup it links to the one collapsed person.
- 6 Boegoe St is the **second tab** of `rptGLByProperty` — the multi-tab silent-drop finding.

## Deposit / trust liability oracle

`rptDepositHeld` and `rptDepositSummary` agree exactly:

| ref | required | held | still due |
|---|---|---|---|
| LEA000001 | 17720 | 17720 | 0 |
| LEA000002 | 7500 | 7500 | 0 |
| **total** | **25220** | **25220** | **0** |

Held **by agent**, 0 by landlord on both.

### Double-entry cross-check (from `rptTrialBalance`, 2 tabs)

The trust liability is confirmed by the trial balance closing the asset against the liability:

| property | Security Deposit *Account* (asset) | Security Deposit *Held* (liability) |
|---|---|---|
| Twin Peaks | 17720 | −17720 |
| 6 Boegoe St | 7500 | −7500 |

Asset = liability on both → the R25,220 the importer must materialise as trust deposit liability
is a genuine double-entry figure, not a single-report assertion.

## Findings surfaced by the acceptance run (pure path, no DB)

1. **MRI contact vocabulary auto-maps 26/26** — no new dialect aliases needed (MRI Rentbook is
   TPN-integrated; the TPN aliases already cover it).
2. **`IDENTIFIER` is polymorphic** — SA ID (13 digits) for natural persons, CIPC (`YYYY/NNNNNN/NN`)
   for juristics. We map it unconditionally to `id_number`; a company's CIPC would fail the SA-ID
   checksum and be mis-flagged. Latent on this book (only the agent has a CIPC there, and the agent
   path ignores `id_number`), but real. Tracked in OUTSTANDING.
3. **Multi-tab silent-drop** — `Step0Upload` reads `SheetNames[0]` only; 6 Boegoe St lives on tab 2
   of `rptGLByProperty` and would be silently lost by the single-sheet reader.
