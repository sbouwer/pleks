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

---

# ADDENDUM_21C · PHASE 0 — the MRI export topology map (the assembler's contract)

The gate deliverable for the multi-table assembler (ADDENDUM_21C §4 Phase 0). Empirically walked from the real
museum set — every report's header row, key column, prefix namespace, and cross-report edge. PII-free. **No
assembly code until this map exists (CD ruling).**

## The report set — what each is, and whether it is an IMPORT SOURCE or REFERENCE-ONLY

| Report | tabs | header row | key column | namespace | role | import source? |
|---|---|---|---|---|---|---|
| `AdmRentbookBillingDetail` | 1 | 0 | `REFERENCE` | **LEA** | lease spine — dates, rent, status | **yes** (lease) |
| `LeaseRentRoll` | 1 | 1 | `REFERENCE` (+`INVOICE`) | **LEA**, INV | per-invoice money breakdown (RENTAL/REPAIRS/UTILITIES/FEES/OTHER/CREDITS/TOTAL DUE/COMMISSION) | **yes** (money) |
| `ContactsExport` | 1 | 1 | `ENTITY ID` + `REFERENCE` | **TEN/ONR/SUP/AGT** | contact identity master — SA ID, bank, VAT, email, address | **yes** (identity) |
| `PropertySummary` | 1 | 5 | `REFERENCE` | **PRO** | property master (PRO code → property name, state) | **yes** (property) |
| `DepositHeld` | 1 | 1 | `REFERENCE` | **LEA** | deposit held per lease (TOTAL/BY AGENT/BY LANDLORD) | **yes** (deposit) |
| `DepositSummary` | 1 | 1 | `REFERENCE` | **LEA** | deposit required/held/still-due per lease | yes (deposit, dup of Held) |
| `LeaseExpiry` | 1 | 1 | `REFERENCE` | **LEA** | **the only lease↔party link** — by NAME string; FILTERED (expiring only) | ref-only (see edges) |
| `GLByProperty` | **2** | 6 / 5 | none (DATE/DESC/DR/CR/BAL) | none | GL ledger; property context in **section breaks** | **reference-only** |
| `TrialBalance` | **2** | 6 / 5 | none | none | control totals per property (the reconciliation oracle) | reference-only |
| `VendorGL` | 1 | 6 | none | none | vendor ledger | reference-only |

## The namespace map — FIVE typed, DISJOINT `REFERENCE` namespaces

`REFERENCE` is not one join key — it is a **typed discriminator** (ADDENDUM_21C D-5). Five namespaces, no value
overlap between them:

- **`LEA…`** — leases (BillingDetail, RentRoll, DepositHeld, DepositSummary, LeaseExpiry)
- **`PRO…`** — properties (PropertySummary) ← *not named in the spec's §1; found in Phase 0*
- **`TEN… / ONR… / SUP… / AGT…`** — contacts, one sub-namespace per party type (ContactsExport)
- **`INV…`** — invoices (RentRoll, secondary key)

## The edge map — what is KEYED, what is a NAME STRING, what is MISSING

Applying D-8 (a reference is resolved by VERIFIED value-overlap, never by name/container):

| Edge | mechanism | D-8 class | verdict |
|---|---|---|---|
| LEA → money | `REFERENCE=LEA…` shared by BillingDetail / RentRoll / DepositHeld | key overlap | **deterministic** ✓ |
| LEA → deposit | `DepositHeld/Summary.REFERENCE = LEA…` | key overlap | **deterministic** ✓ (answers §5 Q1) |
| LEA → property | lease reports carry `PROPERTY NAME` as **text**, never the `PRO` code | display-value overlap | **fuzzy** (name; hold-if-ambiguous) |
| LEA → tenant/landlord | **only** `LeaseExpiry.TENANTS = "Family Farao (0719780357)"` + `LANDLORD` name | display-value, and INCOMPLETE | **MISSING as a key; held** |
| TEN/ONR/SUP/AGT ↔ LEA | `LEA…` ∩ `TEN…` = ∅ (no shared values) | **no overlap** | **no edge — separate namespaces** |

### The missing junction edge, named explicitly (ADDENDUM_21C §2)

**There is NO key-level lease↔party edge in these eleven reports.** The contact namespaces (`TEN/ONR/SUP/AGT`)
and the lease namespace (`LEA`) share no values, so D-8 correctly yields *no edge* — not a fuzzy join to attempt,
an edge that is **absent from the dataset**. The only lease→party link is the `LeaseExpiry` display string, and
that report is **FILTERED** (leases expiring soon): it lists `LEA000001` but **not `LEA000002`**, so even the
name-string edge is incomplete — `LEA000002` has *no* party linkage in any of the eleven files. The set is
**missing its junction report** (the MRI tenancy-schedule / lease-detail report that carries `LEA` **and** the
`TEN/ONR` codes per row). This is a COMPLETENESS gap, not a join-cleverness gap (D-2/D-3).

## The two §5 open questions — RESOLVED from the data

1. **Deposit keys on `LEA`, not `TEN`.** `DepositHeld.REFERENCE` and `DepositSummary.REFERENCE` are both `LEA…`.
   The deposit edge is owned by the **lease** — imported deposits attach to the lease (composes cleanly with the
   deposit-attestation + rate-hold model, which is lease-scoped).
2. **`RentRoll` (LEA-keyed) carries the money the importer needs; `GLByProperty`/`TrialBalance`/`VendorGL` are
   REFERENCE-ONLY.** RentRoll gives the full per-lease breakdown (RENTAL/REPAIRS/UTILITIES/FEES/OTHER/CREDITS/
   COMMISSION) by key. The GL reports have no key column — their property/lease context lives in **sheet section
   breaks** (e.g. a `Twin Peaks(Johan Bouwer)` title row above each block) — so attributing GL rows needs
   structural section parsing. But the importer never needs to: RentRoll supersedes GL as the money source, so
   **GL section-parsing is a RECONCILIATION concern (control-total checks), not an import path.** GL/TrialBalance/
   VendorGL do not enter the assembler's import output.

## The required-report manifest (ADDENDUM_21C D-2) — minimal sufficient set to import a portfolio

| # | Report (MRI) | Must carry (keys) | Supplies | Status in museum set |
|---|---|---|---|---|
| 1 | **junction / tenancy schedule** | `LEA` **and** `TEN`/`ONR` per row | the lease↔party edge | **MISSING — must be exported** |
| 2 | lease detail | `LEA` → dates, rent, status | lease spine | present (`AdmRentbookBillingDetail`) |
| 3 | contacts export | `TEN/ONR/SUP/AGT` → ID, bank, VAT, email | party identity | present (`ContactsExport`) |
| 4 | property summary | `PRO` → property; ideally `LEA`→`PRO` | property + lease-property edge | present (`PropertySummary`), but LEA→PRO only by name |
| 5 | deposit held | `LEA` → deposit | trust deposit liability | present (`DepositHeld`) |
| 6 | rent roll (optional) | `LEA` → money breakdown | per-lease charges | present (`LeaseRentRoll`) |

**Reference-only, NOT in the manifest:** `GLByProperty`, `TrialBalance`, `VendorGL` (control/reconciliation).

**The gate on Phase 1:** without report #1 (the junction), the assembler resolves the lease spine, money,
deposits and property (name-fuzzy), but **every lease↔party edge is HELD** (D-3) — the book imports with all
tenancies flagged "no resolvable party linkage". The correct first action is to obtain the junction report, not
to fuzzy-match names. If the agency cannot export it, the D-7 fallback (name+phone via the identity matcher,
hold-if-ambiguous) is the safety net — never the primary path.

