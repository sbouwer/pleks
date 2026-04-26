# CC Edit Guide — PROCESSING_PURPOSES.md post-review revisions (v4)

**Target file:** `brief/legal/PROCESSING_PURPOSES.md`
**Context:** Post-authoring architectural review (three rounds) plus founder corrections identified additions and corrections before public render goes live. Effective date of the register (2026-05-01) is still in the future, so these land as **pre-launch revisions under the same `2026.1` version** — no version bump, no re-consent flow triggered.

**This is v4 of the guide, superseding v1/v2/v3 in full.** v4 adds two edits over v3: a factual correction to Purpose B9 (application fee funds flow — no portion goes to the agency; fee amount is variable, not fixed in the register) and Information Officer designation (Stéan Bouwer). v4 also amends Edit 8 and Edit 11 to align with those corrections.

**Apply edits in numbered order. Edits 1–7, 9–10, 12–16 are unchanged from v3. Edits 8 and 11 are revised in v4. Edits 17 and 18 are new in v4.**

---

## Edit 1 — POPIA s20 + s21 reference in Operator Agreement mention

**Find:**

```
For data arising from agency use of the platform — tenant profiles, leases, inspections, maintenance, communications, trust transactions, deposits, applications, credit checks, owner statements, and every other artefact of property management. The agency (a property practitioner holding a current PPRA Fidelity Fund Certificate in South Africa, or a landlord operating self-managed properties) is the Responsible Party; Pleks processes this data on the agency's behalf, under the agency's lawful bases, under the Pleks Operator Agreement.
```

**Replace with:**

```
For data arising from agency use of the platform — tenant profiles, leases, inspections, maintenance, communications, trust transactions, deposits, applications, credit checks, owner statements, and every other artefact of property management. The agency (a property practitioner holding a current PPRA Fidelity Fund Certificate in South Africa, or a landlord operating self-managed properties) is the Responsible Party; Pleks processes this data on the agency's behalf, under the agency's lawful bases, under the Pleks Operator Agreement — which incorporates the mandatory written-contract terms required by POPIA s20 (Operator authorisation and confidentiality obligations) and s21 (written contract governing the processing, including the subject-matter and duration of processing, nature and purpose, type of personal information, categories of data subjects, obligations and rights of the Responsible Party, and security measures).
```

---

## Edit 2 — Enhance Purpose B12 (Trust account reconciliation)

**Find the entire existing Purpose B12 block** (from `## Purpose B12` heading to the `## Purpose B13` heading exclusive).

**Replace with:**

```
## Purpose B12 — Trust account reconciliation

- **Purpose name (internal):** `trust_reconciliation`
- **Description:** Monthly reconciliation of the agency's Section 86 trust account. Bank statement import (OFX/CSV/QIF via BUILD_50 Part A), matching of rent receipts against ledger entries, verification of disbursements to landlords and suppliers, three-balance comparison, variance acknowledgement, sign-off. Produces an EAAB/PPRA-compliant audit export (PDF + XLSX) with SHA-256 manifest hash for tamper-evidence. Supports the agency's annual PPRA audit and general trust-account compliance year-round.
- **Controller:** Agency (Responsible Party); Pleks (Operator); the agency's bank (third party, not an Operator to Pleks — the agency's relationship with their bank is direct)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(c) compliance with law (Property Practitioners Act s54, Estate Agency Affairs Act s32 trust account requirements, PPRA audit requirements, Tax Administration Act s29 record-keeping)
- **Personal data categories:** tenant names on trust transactions, landlord names on disbursements, supplier names on disbursements, transaction amounts, payment references, dates of payment, bank statement narrative text (may contain names incidentally), masked bank account numbers (stored encrypted at rest; unmasked only for the operational moment they are referenced in a reconciliation or disbursement flow), deposit and management fee records
- **Data subject categories:** every natural person whose money flows through the agency's trust account — tenants paying rent and deposit, landlords receiving rental disbursements, suppliers receiving payment for maintenance and other services
- **Recipients / Operators:** Supabase (storage), Anthropic (variance explanation narrative — Purpose B22, `trust_audit_narrative` purpose)
- **Cross-border transfer:** Yes for AI processing (see Appendix B); bank data import is a local file upload or future Yodlee feed.
- **Retention:** Minimum 5 years from the close of the reconciliation period, in accordance with PPRA trust-record retention, Tax Administration Act s29 business-record retention, and D-POPIA-02. Where a longer period applies under the retention-hierarchy rule (e.g., audit-log retention of 7 years per Purpose A10 for records incorporated into audit trails, or FICA retention for records that double as FICA evidence), the longer period controls. Pleks's operational practice may retain for longer given storage cost is negligible and the regulatory value of long tails in audit contexts is high.
- **DPIA required:** No — regulatory-mandated accounting processing
- **Related specifications:** BUILD_64 (sovereign trust — full doctrine and invariant enforcement), BUILD_09 (bank reconciliation), BUILD_50 Part A (OFX/CSV/QIF import)
- **Notes:** Pleks never holds trust funds; the reconciliation describes the agency's own bank account activity. This is the sovereign-trust invariant.
```

---

## Edit 3 — Insert Purpose B24 and B25 before Appendix A

**Find the exact line that begins Appendix A:**

```
# Appendix A — Recipients & Operators directory
```

**Replace with:**

```
## Purpose B24 — FICA / KYC documentation storage for Accountable Institutions

- **Purpose name (internal):** `fica_kyc_storage`
- **Description:** Store customer due diligence (CDD) documentation that agencies are required to collect under the Financial Intelligence Centre Act (FIC Act) as Schedule 1 Accountable Institutions (Item 20 — estate agents). This includes identity documents (SA ID card/book, passport for foreign nationals), proof of residential address, source-of-funds documentation where applicable, enhanced due diligence (EDD) notes where a higher-risk rating applies, and CDD-related records tied to specific clients. Pleks stores the artefacts as Operator. **Pleks does not perform FICA verification itself** — the Accountable Institution (the agency) is solely responsible for CDD, risk rating, record-keeping obligations, and any Suspicious Transaction Reports (STRs) to the Financial Intelligence Centre via the goAML reporting system. Pleks provides the storage, retrieval, and audit-trail infrastructure the agency needs to satisfy its FICA obligations; the agency remains solely accountable for their fulfilment.
- **Controller:** Agency (Responsible Party and Accountable Institution under FIC Act); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(c) compliance with law — FIC Act s21 (duty to establish and verify identity of clients), s22 (duty to keep records), s23 (period for which records must be kept — 5 years from termination of the business relationship)
- **Personal data categories:** full name, ID number, passport number (foreign nationals), date of birth, nationality, residential address, proof-of-address document (utility bill, bank statement), employment and income details where collected, source-of-funds documentation where applicable, risk rating assigned by the agency, CDD decision record, EDD notes if higher-risk, beneficial ownership chain where the client is a juristic person
- **Data subject categories:** landlords as agency clients (primary — the estate-agent-to-landlord relationship is the typical FICA trigger in rental work); beneficial owners of juristic landlords; other parties only where a specific transaction triggers CDD under the agency's Risk Management and Compliance Programme. Residential-lease tenants are generally not FICA subjects in rental-mandate contexts; an agency may nevertheless perform limited CDD-adjacent checks on tenants under other legal frameworks (CPA, Immigration Act for foreign nationals) and those documents are captured here if the agency uses them as part of a broader risk-based approach.
- **Recipients / Operators:** Supabase (storage of documents and structured CDD records); Anthropic (only if AI-assisted OCR or document extraction is used via `lib/ai/client.ts` — covered under Purpose B22)
- **Cross-border transfer:** Yes — Supabase is US-routed regardless of whether OCR is used. Basis: s72(1)(a) adequate protection via SCCs + s72(1)(d) necessity for the agency's compliance with SA law; the data originates in SA and returns to SA for agency access.
- **Retention:** 5 years from the end of the business relationship (FIC Act s23); 5 years from the date of the relevant transaction for transaction records; longer if the agency is subject to an ongoing FIC investigation (in which case retention continues until instructed otherwise). This retention clock is independent of the lease retention clock (Purpose B6) — the two run in parallel and the longer controls per the retention-hierarchy rule.
- **DPIA required:** No — FICA compliance is a well-established regulatory processing category with statutorily prescribed safeguards
- **Related specifications:** none dedicated currently — CDD documents are captured via the standard document-upload flow in BUILD_02 (properties / landlords) and BUILD_03 (tenants / applications); a Tier 2 ADDENDUM would add FICA-specific workflow (CDD checklist UI, EDD templates, retention countdown display, risk-rating audit trail, RMCP review dashboard) if customer demand warrants it
- **Notes:** Pleks does not integrate with the FIC's goAML reporting system, does not generate Suspicious Transaction Reports, and does not interpret risk ratings. These remain entirely agency responsibilities. Agencies carrying FICA obligations must complete their own Risk Management and Compliance Programme (FIC Act s42) and Implementation (s42A), and should ensure Pleks is referenced as an Operator / record-storage partner within that RMCP. **Statutory retention override:** data-subject rights to erasure or restriction under POPIA s24 do not apply to FICA records during the statutory retention period; such records are excluded from deletion workflows until FIC Act s23 retention has expired. See the retention-hierarchy rule in the maintenance discipline section.

## Purpose B25 — Agency-originated direct marketing to tenants and landlords via the platform [reserved — not currently deployed]

- **Purpose name (internal):** `agency_direct_marketing` (reserved)
- **Description:** This purpose is reserved and defined in advance, but **not currently deployed**. It covers the hypothetical future case where an agency uses Pleks to send direct marketing to its own tenants or landlord clients — for example, cross-selling contents insurance, advertising home-care services, promoting partner products, notifying tenants of a new property available for their renewal consideration, or offering rental insurance to landlords. Pleks currently sends only transactional and legal communications on behalf of agencies (Purpose B17); no direct marketing is performed. If and when an agency wishes to enable marketing messaging, this purpose becomes active, this register is updated to version `2026.2`, and the re-consent notification flow is triggered per BUILD_65 §5.
- **Controller:** Agency (Responsible Party); Pleks (Operator). The agency's relationship with its tenants and landlord clients is a customer-relationship under POPIA s69, which directly affects the lawful-basis analysis.
- **Lawful basis (POPIA s11):** **To be confirmed per deployment context.** For marketing to existing tenants or landlords who are already in a customer relationship with the agency, POPIA s69(3)(a) permits processing on an opt-out basis provided the communication offers an unambiguous opt-out mechanism and clearly identifies the sender. For marketing to non-customers, POPIA s69(1) requires explicit opt-in consent. The agency, as Responsible Party, is responsible for establishing and documenting the correct basis before each marketing send. The CPA s32 unsolicited-communication provisions apply in parallel.
- **Personal data categories (when active):** name, contact phone, contact email, communication preferences, marketing-opt-out state, marketing-opt-in timestamp where opt-in basis is used, tenancy or landlord relationship context (which agency, which property, relationship duration), segmentation tags the agency assigns
- **Data subject categories (when active):** tenants of the agency; landlord clients of the agency; secondary occupants who have separately consented to communications
- **Recipients / Operators (when active):** Supabase, Resend (email), Africa's Talking (WhatsApp and SMS), possibly Anthropic (if AI-generated marketing content is used — Purpose B22)
- **Cross-border transfer (when active):** Yes — see Appendix B
- **Retention (when active):** communication record retention follows Purpose B17 (5 years post-termination of the underlying relationship); marketing consent expires separately — opt-out state retained indefinitely until the data subject requests otherwise, and where no active opt-in consent exists for a non-customer marketing contact, the contact record is purged 12 months after the end of any underlying relationship
- **DPIA required:** Yes — will be assessed at the point of deployment because direct marketing triggers distinct POPIA s69 and CPA s32 compliance considerations, segmentation introduces automated-decision-making concerns that require review, and the risk-of-harm balance to data subjects shifts when messaging moves from transactional to persuasive
- **Related specifications:** none currently; a future build spec or ADDENDUM will formalise the deployment, including consent UX, one-click unsubscribe mechanism (CPA s32), segmentation tooling, identification-of-sender compliance, and tier gating
- **Notes:** This placeholder exists so that agencies reviewing the register before procurement can confirm that **Pleks does not currently send marketing to their tenants or landlord clients**, and so that any future change of posture is surfaced in a `2026.N` material-change update with clear advance notification to data subjects. Pleks's own marketing to Pleks's own prospects (Purpose A7 — waitlist) is a separate purpose and is unaffected by anything in this purpose.

---

# Appendix A — Recipients & Operators directory
```

---

## Edit 4 — Update the change log

**Find:**

```
| Version | Date | Change | Material? |
|---------|------|--------|-----------|
| 2026.1 | 2026-05-01 | Initial publication of the register. Covers 12 Pleks-RP purposes and 23 Pleks-Operator purposes established through BUILD_00–BUILD_65. | Initial — no re-consent flow triggered |
```

**Replace with:**

```
| Version | Date | Change | Material? |
|---------|------|--------|-----------|
| 2026.1 | 2026-05-01 | Initial publication of the register. Covers 12 Pleks-RP purposes and 25 Pleks-Operator purposes established through BUILD_00–BUILD_65. | Initial — no re-consent flow triggered |
| 2026.1 (pre-launch revision) | 2026-04-20 | Pre-launch architectural review (three review rounds) plus founder corrections. Structural additions: retention-hierarchy rule, mixed-role processing clarification, security-safeguards (POPIA s19) section, incidental-s26 executive summary. New purposes: B24 (FICA / KYC documentation storage) and B25 (agency-originated direct marketing — reserved placeholder). Purpose enhancements: B3 (third-party data subjects — references, employer contacts; removed hardcoded fee amounts), B5 (POPIA s71 explanation and challenge rights for FitScore), B9 (application-fee flow corrected — funds flow Pleks↔applicant with no agency portion; specific fee amounts removed as they vary with underlying cost changes), B12 (supplier disbursements, masked bank account numbers, retention-hierarchy alignment), B22 (explicit AI-assistive-only global safeguard), B23 (data-subject responsibility clarification). Information Officer designated (Stéan Bouwer) for Part A Pleks-RP purposes. Corrections: FIC Act section citations fixed (s22/s23 record-keeping, not s42/s43 RMCP/training); POPIA s72(1) subsection numbering corrected throughout Appendix B and in-line purpose references to match the actual ordering in POPIA Act 4 of 2013 s72(1); cross-border transfer basis language expanded with specific reference to the EU 2021/914 SCC framework as implementation mechanism. Added explicit POPIA s20 + s21 reference to the Pleks Operator Agreement mention in the Controllers section. | Non-material — no new processing commences; enhancements clarify existing processing; B25 is a reserved placeholder; corrections fix drafting errors. Register not yet in effect (effective_from 2026-05-01). No re-consent flow needed. |
```

---

## Edit 5 — Housekeeping count in any preamble mention

**If the text `12 Pleks-RP purposes and 23 Pleks-Operator purposes` appears anywhere other than the change log, update to `12 Pleks-RP purposes and 25 Pleks-Operator purposes`.**

---

## Edit 6 — Verify rejection-notice email template phrasing [separate file, not the register]

Open `emails/popia/request_rejected.tsx` (to be created as part of BUILD_65 implementation). Confirm the email body includes, near the close:

> If you are dissatisfied with this outcome, you have the right to lodge a complaint with the Information Regulator of South Africa at complaints.IR@justice.gov.za or +27 10 023 5207.

If the template does not yet exist, flag this as a requirement for BUILD_65 implementation. If it does exist but the phrasing differs, standardise to the above wording.

**No change to `PROCESSING_PURPOSES.md` for Edit 6.**

---

## Edit 7 — Insert retention-hierarchy rule in "How to maintain this register" section

**Find the exact closing line of the How-to-maintain section before the `---` separator:**

```
Non-material changes (typo fixes, formatting, clarifications that don't alter processing substance) increment the patch component of the version number (`2026.1.1`) and are noted in the change log without triggering the material-change re-consent flow. Material changes (new purpose, new Operator, new cross-border transfer, retention period change, lawful basis change, new data category, new recipient) increment the version number to `2026.2` (or equivalent) and trigger the re-consent notification flow per BUILD_65 §5.
```

**Replace with:**

```
Non-material changes (typo fixes, formatting, clarifications that don't alter processing substance) increment the patch component of the version number (`2026.1.1`) and are noted in the change log without triggering the material-change re-consent flow. Material changes (new purpose, new Operator, new cross-border transfer, retention period change, lawful basis change, new data category, new recipient) increment the version number to `2026.2` (or equivalent) and trigger the re-consent notification flow per BUILD_65 §5.

### Retention hierarchy rule

Where multiple retention periods apply to the same record, Pleks enforces the longest applicable statutory, contractual, or evidentiary retention period. Purpose-level retention periods in this register represent **minimum retention commitments** and may be overridden where:

- a longer statutory retention period applies (e.g., Tax Administration Act s29 — 5 years from last entry; PPRA trust-record obligations; FIC Act s23 — 5 years from termination of business relationship; SARS tax record retention; Companies Act record retention),
- the record forms part of the audit trail (Purpose A10 — 7 years), in which case audit-log retention governs for the audit-trail aspects of the record,
- the record is in scope of an active legal hold, subject-request restriction (per BUILD_65 `request_type='restriction'`), ongoing Tribunal dispute, ongoing FIC investigation, or subpoena, in which case retention continues until the hold is released.

Data-subject erasure requests are executed subject to this hierarchy. Records subject to mandatory retention are excluded from deletion workflows until the applicable retention period has expired; see `lib/popia/retention.ts` `isErasableNow()` for the enforcement implementation and D-POPIA-06 in BUILD_65 for the policy-layer doctrine.

Where this register cites a specific retention period under a purpose, that period is the minimum commitment. Where a longer period applies under this hierarchy, the longer period controls without requiring a register amendment.
```

---

## Edit 8 — Insert mixed-role processing clarification in Controllers section [revised from v3]

**Revision from v3:** the B9 bullet is strengthened to reflect the correct funds-flow framing per founder correction (no portion flows to agency under any arrangement).

**Find the closing paragraph of the "The neutral sovereign posture" subsection:**

```
These are twin moats. The Operator-Responsible-Party split in this register is the POPIA expression of the "Pleks is not the trustee" doctrine.
```

**Replace with:**

```
These are twin moats. The Operator-Responsible-Party split in this register is the POPIA expression of the "Pleks is not the trustee" doctrine.

### Mixed-role processing clarification

Certain platform features are processed by Pleks as an independent Responsible Party even where those features are initiated within an agency workflow. The clearest examples are:

- **Purpose A8 (platform-level billing and subscriptions)** — Pleks bills the agency for platform use; Pleks is the Responsible Party for that billing relationship despite the agency being the data subject.
- **Purpose B9 (application fee processing via PayFast)** — despite being housed in Part B, this is a Pleks-RP purpose with no agency involvement in the funds flow. The transaction is between Pleks and the applicant directly; Pleks receives the payment from the applicant, pays Searchworx for the underlying credit report (Purpose B4), and retains the balance as platform service revenue covering the operation and maintenance of the application-processing service. **No portion of the application fee flows to the agency under any tier or commercial arrangement between Pleks and the agency.** The purpose is listed under B because the workflow is initiated by an agency-operated application flow, but the controller relationship and the financial flow are both Pleks↔applicant.
- **Part A observability purposes (A3 error monitoring, A5 uptime, A6 cost/usage, A10 audit log, A12 platform administration)** — these operate across all organisations on the platform; Pleks is the Responsible Party for the observability artefacts themselves, even where the observed activity is agency-operated processing.

These mixed-role activities are structurally and logically separated from agency-operated processing, each under its own lawful basis, and the existence of any Pleks-RP layer over a cross-cutting platform concern does not alter the Operator relationship for Part B purposes. Pleks is not a joint controller for agency-operated data; the RP relationships described here concern distinct processing activities directed at distinct personal information.
```

---

## Edit 9 — Expand POPIA s71 safeguards in Purpose B5 (FitScore)

**Find the Notes line in Purpose B5:**

```
- **Notes:** The "show every applicant regardless of score" requirement is a non-negotiable in the system prompt and in the spec lineage — it is a legal protection against discrimination claims (Equality Act 4 of 2000, Rental Housing Act s4(1) prohibition on unfair discrimination) and a product decision.
```

**Replace with:**

```
- **Notes:** The "show every applicant regardless of score" requirement is a non-negotiable in the system prompt and in the spec lineage — it is a legal protection against discrimination claims (Equality Act 4 of 2000, Rental Housing Act s4(1) prohibition on unfair discrimination) and a product decision. **POPIA s71 subject rights:** FitScore is a recommendation engine only; the final decision to approve or decline an application remains exclusively with the agency's human user. No automated decision producing legal or similarly significant effects is taken without human involvement, in compliance with POPIA s71(1). Data subjects may request sufficient information about the underlying logic of the FitScore calculation under POPIA s71(2)(a), and may make representations regarding any decision taken using the score under POPIA s71(3)(c); such requests are handled via the data-subject-request workflow (Purpose B23) with the agency as Responsible Party.
```

---

## Edit 10 — Fix POPIA s72(1) subsection numbering throughout Appendix B and in-line references, and expand cross-border basis language

**Why:** Pre-existing drafting error independent of review feedback. Register currently cites POPIA s72(1) subsections in an order that does not match POPIA Act 4 of 2013 s72(1). Correct ordering:

- s72(1)(a) = adequate protection via law, binding corporate rules, or binding agreement ("SCCs")
- s72(1)(b) = data subject consent
- s72(1)(c) = performance of contract between data subject and Responsible Party
- s72(1)(d) = performance of contract in interest of data subject
- s72(1)(e) = benefit of data subject

Current register mapping (wrong) is (a)=consent, (b)=DS-contract, (c)=interest-contract, (d)=benefit, (e)=SCCs. Apply mapping **(a→b, b→c, c→d, d→e, e→a)** to every s72(1)(X) reference in the register, then expand definitional text with SCC-framework specificity.

### 10A — Rewrite the Appendix B introduction definitions

**Find:**

```
Every transfer of personal information outside South Africa. Under POPIA s72, cross-border transfers require one of the following bases:

- **s72(1)(a)** — data subject has consented to the transfer
- **s72(1)(b)** — transfer is necessary for the performance of a contract between the data subject and the Responsible Party, or of pre-contract steps at the subject's request
- **s72(1)(c)** — transfer is necessary for the conclusion or performance of a contract concluded in the interest of the data subject between the Responsible Party and a third party
- **s72(1)(d)** — transfer is for the benefit of the data subject and consent cannot reasonably be obtained; benefit would likely be given
- **s72(1)(e)** — recipient is subject to a law or binding corporate rules or binding agreement providing an adequate level of protection substantially similar to POPIA (this is the typical SCC basis in SaaS operator agreements)
```

**Replace with:**

```
Every transfer of personal information outside South Africa. Under POPIA s72 (Act 4 of 2013), cross-border transfers require one of the following bases:

- **s72(1)(a)** — the recipient is subject to a law, binding corporate rules, or binding agreement providing an adequate level of protection substantially similar to POPIA (this is the typical "SCC" basis in SaaS Operator agreements)
- **s72(1)(b)** — the data subject has consented to the transfer
- **s72(1)(c)** — the transfer is necessary for the performance of a contract between the data subject and the Responsible Party, or of pre-contract steps at the subject's request
- **s72(1)(d)** — the transfer is necessary for the conclusion or performance of a contract concluded in the interest of the data subject between the Responsible Party and a third party
- **s72(1)(e)** — the transfer is for the benefit of the data subject and consent cannot reasonably be obtained, but would likely be given if it could be

**SCC framework (s72(1)(a) implementation).** Cross-border transfers to jurisdictions without an SA Information Regulator adequacy determination (including the United States, where most Pleks Operators are domiciled) are governed by Standard Contractual Clauses aligned with EU Commission Implementing Decision (EU) 2021/914 — the predominant SaaS-industry SCC standard — incorporated into each vendor's Data Processing Addendum and relied upon as the "binding agreement providing an adequate level of protection substantially similar to POPIA" under s72(1)(a). Where appropriate, supplementary transfer impact assessments and additional technical and organisational safeguards (encryption, pseudonymisation, access control, logging) reinforce the adequacy assessment. Where required for specific processing activities, transfers are further justified under s72(1)(b) (data subject consent — e.g., for credit-check derivative processing at Purpose B4) or s72(1)(c) (necessity for performance of a contract between the data subject and the Responsible Party — e.g., for transactional lease communications at Purpose B17).
```

### 10B — Rewrite the Appendix B table

**Find the existing table beginning with `| Recipient | Domicile |`. Replace the entire table with:**

```
| Recipient | Domicile | Purposes served | Primary basis | Supporting instrument |
|-----------|----------|-----------------|---------------|-----------------------|
| Supabase | US (with regional routing) | A1–A12, B1–B25 | s72(1)(a) SCCs | Supabase DPA |
| Anthropic | US | B22 (and its sub-purposes) | s72(1)(a) SCCs + s72(1)(b) explicit consent for credit-check derivatives | Anthropic Enterprise DPA (zero-retention) |
| Sentry | US | A3 | s72(1)(a) SCCs | Sentry DPA |
| Resend | US | A1, A2, A4, A7, A8, A9, A10, A12, B2, B10, B11, B16, B17, B20, B21, B23 | s72(1)(a) SCCs + s72(1)(c) performance of contract | Resend DPA |
| Meta (via Africa's Talking) | US / IE | B17 (WhatsApp) | s72(1)(a) SCCs + s72(1)(b) consent at WhatsApp opt-in | Meta Business Platform terms |
| Africa's Talking | Kenya | B2, B11, B15, B16, B17, B18 | s72(1)(a) SCCs; Kenya has a Data Protection Act (2019) providing substantially similar protection | Africa's Talking DPA |
| Better Stack | US | A5 | s72(1)(a) SCCs; no PII transferred | Better Stack DPA |
| Vercel | US (with global edge) | A1–A12, B1–B25 (hosting) | s72(1)(a) SCCs | Vercel DPA |
| GitHub | US | contributor identities only; no customer data | s72(1)(a) SCCs | GitHub Terms |
```

### 10C — In-line s72 corrections elsewhere in the register

**Action for CC:** grep for every remaining `s72(1)(` occurrence in the register **outside Appendix B**. For each occurrence, apply the mapping (a→b, b→c, c→d, d→e, e→a) and confirm the cited basis matches the intent. Use:

```bash
grep -n "s72(1)" brief/legal/PROCESSING_PURPOSES.md
```

Expected in-line references: A7 consent basis; B4 notes if any; B6 citing "SCCs and s72(2) necessity for performance"; B22 cross-border basis; B24 (already handled in Edit 3 with corrected citations). The correct intent after mapping is usually one of:
- "SCCs" → s72(1)(a)
- "consent" → s72(1)(b)
- "performance of contract with the data subject" → s72(1)(c)
- "benefit of the data subject" → s72(1)(e)

---

## Edit 11 — Expand Purpose B3 (Tenant application) with third-party data subjects and remove hardcoded fee amounts [revised from v3]

**Revision from v3:** the Notes-block replacement now also removes the specific R399/R749 fee amounts (per founder correction — fee amounts vary with underlying cost changes and are not committed in the register).

### 11A — Data categories line

**Find:**

```
- **Personal data categories:** full name, ID number, date of birth, contact phone, contact email, employment details, employer contact details, salary, dependent / household member details, previous rental history and landlord references, supporting documents
```

**Replace with:**

```
- **Personal data categories:** full name, ID number, date of birth, contact phone, contact email, employment details, employer contact details, salary, dependent / household member details, previous rental history, landlord references, employer references, and any other third-party contact details provided by the applicant (e.g., character references, next of kin, emergency contacts), supporting documents
```

### 11B — Notes line (revised from v3 to remove specific fee amounts)

**Find:**

```
- **Notes:** The applicant pays the application fee (R399 single, R749 joint) via PayFast directly — the agency never pays for a credit check. The applicant's consent to the credit check is captured explicitly before the check is initiated (see Purpose B4).
```

**Replace with:**

```
- **Notes:** The applicant pays the application fee via PayFast directly — the agency never pays for a credit check. The fee is a Pleks-to-applicant service charge; the agency receives no portion of it. See Purpose B9 for fee structure and funds flow. The applicant's consent to the credit check is captured explicitly before the check is initiated (see Purpose B4). **Third-party data subjects:** where an application form captures personal information about parties other than the applicant themselves (landlord references, employer contacts, character references, household members, emergency contacts), the agency, as Responsible Party, is responsible for ensuring it has a lawful basis under POPIA s11 to collect and process that third-party data. Pleks, as Operator, stores what the agency collects; the sufficiency of consent or of the agency's legitimate-interest balancing for each third party named is the agency's own s17 accountability obligation.
```

---

## Edit 12 — Insert incidental s26 executive summary at top of Appendix C

**Find the introductory paragraph of Appendix C:**

```
POPIA s26 defines "special personal information" as information concerning a data subject's religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, or criminal behaviour. Processing of s26 categories is generally prohibited unless a s27 justification applies.

**Pleks does not deliberately process s26 categories.** The following boundaries are documented honestly because they may touch s26-adjacent data incidentally:
```

**Replace with:**

```
POPIA s26 defines "special personal information" as information concerning a data subject's religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, or criminal behaviour. Processing of s26 categories is generally prohibited unless a s27 justification applies.

**Summary — incidental special personal information.** Certain Pleks processing activities may incidentally involve personal information that is adjacent to s26 categories, including: health-related information that tenants may disclose when describing a maintenance issue (B15), biometric or identifying information incidentally visible in inspection photographs (B14), sensitive personal details that may appear in application supporting documents (B3), and civil judgment history surfaced by credit checks (B4, which is s26-adjacent but not s26 under the strict SA definition — see C3 below). Such processing is incidental to the primary purpose, not actively solicited, not indexed or processed as s26 data, and is subject to strict access control, minimisation, and security safeguards in line with s19 and the register's data-protection posture generally. The per-category detail below records where each incidental boundary lies.

**Pleks does not deliberately process s26 categories.** The following boundaries are documented honestly because they may touch s26-adjacent data incidentally:
```

---

## Edit 13 — Insert Security safeguards (POPIA s19) section after Information Regulator section

**Find:**

```
- +27 10 023 5207
- https://inforegulator.org.za

---

## How to maintain this register
```

**Replace with:**

```
- +27 10 023 5207
- https://inforegulator.org.za

---

## Security safeguards (POPIA s19)

Pleks implements appropriate technical and organisational measures to secure personal information against loss, damage, unauthorised access, and unlawful processing, consistent with POPIA s19 and the register's accountability posture. Current measures:

- **Encryption in transit** — TLS 1.2+ for all client-server and server-server connections; HSTS enforced on public surfaces; no plaintext fallback
- **Encryption at rest** — AES-256 at the database layer via Supabase; Storage bucket contents encrypted at rest; sensitive fields (bank account numbers, TOTP secrets, passkey credentials) encrypted column-level where applicable
- **Role-based access control** — Postgres Row-Level Security (RLS) enforced on every table carrying personal information; service-role access reserved for server-side with gateway helper enforcing organisation-scoped queries; no broad-access admin views
- **Authentication** — magic-link auth for tenant/landlord/supplier roles; password + mandatory MFA for agent roles per BUILD_62; MFA-fresh step-up required for fiduciary-class actions (erasure approval, export release, trust sign-off) per BUILD_62 Part A and BUILD_65 D-POPIA-10
- **Immutable audit logging** — every state-changing operation recorded in `audit_log` with actor, target, event type, timestamp, and change payload; no UPDATE or DELETE policies on the log itself; retention 7 years per Purpose A10
- **PII scrubbing for observability** — error monitoring (Sentry), log aggregation, and third-party observability tools receive PII-scrubbed events only; scrubber at `lib/observability/scrubbing.ts` runs pre-transmission and strips request bodies from sensitive routes plus PII patterns (email, phone, SA ID, bank account) from remaining payloads; opt-out respected per ADDENDUM_00E
- **Storage-path RLS** — Supabase Storage policies constrain access to object paths matching the requesting user's organisation or subject identity; signed URLs with TTL for all sensitive downloads; no public bucket access to customer data
- **Operator contractual controls** — every third-party Operator (Appendix A) operates under a Data Processing Addendum with SCCs where cross-border, SOC 2 or equivalent certifications where available, and documented retention and breach-notification terms
- **Sovereign-trust discipline** — Pleks holds no client funds; client funds reside in the agency's own Section 86 trust account at the agency's own bank; no outbound payment rails from Pleks (BUILD_64 invariant enforced at schema, code, ESLint, and UI layers)
- **Sovereign-data discipline** — Pleks is Operator for agency-operated data; agency is Responsible Party; Pleks's cross-agency admin surfaces (`/admin/popia-requests`) route to the correct Responsible Party and never execute agency-data operations directly (BUILD_65 D-POPIA-17 invariant)
- **Incident response** — breach detection via Sentry + audit-log review; notification to affected Responsible Parties within 24 hours of detection per the Operator Agreement; notification to data subjects and the Information Regulator per the agency's own s22 breach-notification obligations
- **Retention enforcement** — automated daily retention purge per BUILD_65 §5.6; retention-aware erasure cascade per D-POPIA-06; hierarchy rule per the maintenance discipline section

Security controls are reviewed continuously and updated in line with evolving risk. New processing purposes introduced by subsequent build specifications must document their security posture as part of the purpose entry; deviations from the defaults above require explicit justification.

---

## How to maintain this register
```

---

## Edit 14 — Strengthen DSR responsibility clarification in the agency-framing disclaimer

**Find:**

```
- The Responsible Party is the primary recipient of data-subject requests under POPIA s23–s25. Pleks supports the Responsible Party in responding within the 30-day statutory window (s19(2)(c)) but does not respond in the Responsible Party's place.
```

**Replace with:**

```
- The Responsible Party is the primary recipient of data-subject requests under POPIA s23–s25. Pleks provides tooling to facilitate data-subject-rights requests and to assist Responsible Parties in responding within the 30-day statutory window (s19(2)(c)). Pleks does not assume responsibility for the agency's compliance with POPIA obligations; the duty to respond to a subject request remains with the Responsible Party, and Pleks's role is limited to the Operator's s21 support obligations as described in the Pleks Operator Agreement.
```

---

## Edit 15 — Add AI-assistive-only global safeguard to Purpose B22 Notes

**Find:**

```
- **Notes:** The ESLint `no-restricted-imports` rule enforces that no code imports `@anthropic-ai/sdk` directly — every AI call must go through `lib/ai/client.ts`. This is the choke point that makes AI purpose accounting possible.
```

**Replace with:**

```
- **Notes:** The ESLint `no-restricted-imports` rule enforces that no code imports `@anthropic-ai/sdk` directly — every AI call must go through `lib/ai/client.ts`. This is the choke point that makes AI purpose accounting possible. **Global AI safeguard (POPIA s71):** AI outputs across all sub-purposes are used as assistive tools only and are never the sole basis for decisions that produce legal or similarly significant effects on a data subject. Every sub-purpose that informs a decision (FitScore → tenancy approval; inspection assessment → deposit deduction; LOD generation → formal demand; arrears communication → escalation) is reviewed by a human agent before action, and the review is recorded in the audit trail for the underlying decision. Data-subject rights under s71(2)(a) (information about the logic) and s71(3)(c) (right to make representations) apply to any AI-assisted decision and are routed through the data-subject-request workflow (Purpose B23).
```

---

## Edit 16 — Add retention-override cross-reference to Purpose B23

**Find:**

```
- **Related specifications:** BUILD_65 (POPIA customer-facing surface) — this purpose is the reflexive one the BUILD_65 spec and this register both exist to enable
```

**Replace with:**

```
- **Related specifications:** BUILD_65 (POPIA customer-facing surface) — this purpose is the reflexive one the BUILD_65 spec and this register both exist to enable
- **Notes on retention override:** erasure requests and the full-erasure (`nuke`) request type are executed subject to the retention-hierarchy rule in the maintenance discipline section. Records subject to mandatory statutory retention (FICA s23, PPRA trust records, RHA inspection retention, Tax Administration Act s29, active-legal-hold records) are excluded from deletion workflows and remain retained for the applicable period; subjects are informed at request submission via the pre-submission carve-out disclosure screen per BUILD_65 §5.2. This is not a defect of the erasure right but a POPIA-recognised limit — s24 rights are exercised against the backdrop of other applicable law.
```

---

## Edit 17 — Correct Purpose B9 description (application fee funds flow) [new in v4]

**Why:** Founder correction. The existing B9 description contains a factual error — it states the application fee balance flows to the agency. This is wrong. The fee is a Pleks-to-applicant service charge covering (a) the Searchworx credit-bureau cost and (b) Pleks's operating cost for maintaining the application-processing service. No portion flows to the agency under any tier or arrangement. Additionally, the register currently hardcodes specific fee amounts (R399 / R749) which vary with underlying cost changes and should not be fixed in a public register — the in-product disclosure is the source of truth for the current fee.

**Find the Description line in Purpose B9:**

```
- **Description:** Accept the R399 single or R749 joint rental application fee from the applicant directly via PayFast. The applicant pays; the agency does not. Pleks charges the applicant a platform fee, and the balance flows to the agency (or to Pleks depending on the tier contract).
```

**Replace with:**

```
- **Description:** Accept the applicant's rental application fee directly via PayFast. The fee is a Pleks-to-applicant service charge structured to cover (a) the cost of the underlying credit bureau report payable to Searchworx (see Purpose B4) and (b) Pleks's cost of operating and maintaining the application-processing service. **The agency receives no portion of this fee; funds from the application fee do not flow to the agency under any tier or commercial arrangement between Pleks and the agency.** The fee amount is set by Pleks from time to time based on changes in the underlying Searchworx pricing and Pleks operating costs, and is disclosed to the applicant at the point of payment before the transaction is committed; variations in the fee amount are reflected in the in-product disclosure, not by amending this register.
```

**Additional cleanup for CC — search the register for any remaining hardcoded fee amounts and remove/genericise:**

```bash
grep -n "R399\|R749" brief/legal/PROCESSING_PURPOSES.md
```

Expected occurrences after Edit 11B and Edit 17 apply: **zero**. If any remain (e.g., in other purpose entries or the preamble), replace the specific amount reference with a generic "the application fee" and cross-reference to Purpose B9.

---

## Edit 18 — Information Officer designation [new in v4]

**Why:** Founder designates Stéan Bouwer as Information Officer for Pleks-RP purposes (Part A). Clears one of the three pre-first-paying-customer blockers. Postal address and IR registration filing remain calendar items.

**Find:**

```
- **Information Officer:** [Information Officer — to be confirmed before first paying agency customer] · Bouwer Property Group (trading as Pleks)
- **Email:** privacy@pleks.co.za
- **Postal address:** [to be confirmed]
- **POPIA registration number:** [pending — IR registration for private Responsible Parties is optional but common; will be confirmed before first paying customer]
```

**Replace with:**

```
- **Information Officer:** Stéan Bouwer · Bouwer Property Group (trading as Pleks)
- **Email:** privacy@pleks.co.za
- **Postal address:** [to be confirmed — will be published before first paying agency customer]
- **POPIA registration number:** [pending — IR registration for private Responsible Parties is optional but common; to be filed before first paying customer]
```

---

## Validation after CC applies Edits 1–5 and 7–18

```bash
# Structural
grep -c "^## Purpose B" brief/legal/PROCESSING_PURPOSES.md                      # must equal 25
grep -c "B24\|B25" brief/legal/PROCESSING_PURPOSES.md                           # must be >= 6
grep -c "pre-launch revision" brief/legal/PROCESSING_PURPOSES.md                # must equal 1
wc -l brief/legal/PROCESSING_PURPOSES.md                                        # should be roughly 1050–1090 lines (was 880)

# Edits 1, 2, 11 (s20/s21, B12, B3)
grep -c "POPIA s20\|POPIA s21" brief/legal/PROCESSING_PURPOSES.md               # must be >= 1
grep -c "suppliers receiving\|supplier names on disbursements" brief/legal/PROCESSING_PURPOSES.md  # must be >= 2
grep -c "third-party data subjects\|third-party contact details" brief/legal/PROCESSING_PURPOSES.md  # must be >= 2

# Edit 3 (B24 FICA citations correct)
grep -c "FIC Act s22\|FIC Act s23\|FIC Act s21" brief/legal/PROCESSING_PURPOSES.md  # must be >= 3
grep -c "s42/s43" brief/legal/PROCESSING_PURPOSES.md                            # must equal 0

# Edits 7, 8 (retention hierarchy + mixed-role)
grep -c "retention hierarchy\|Retention hierarchy" brief/legal/PROCESSING_PURPOSES.md  # must be >= 2
grep -c "Mixed-role processing\|mixed-role processing" brief/legal/PROCESSING_PURPOSES.md  # must be >= 1
grep -c "no portion of the application fee\|No portion of the application fee" brief/legal/PROCESSING_PURPOSES.md  # must be >= 2 (mentioned in Edit 8 B9 bullet + Edit 17)

# Edit 9 (s71 rights)
grep -c "s71(2)(a)\|s71(3)(c)" brief/legal/PROCESSING_PURPOSES.md               # must be >= 2

# Edit 10 (s72 numbering corrected)
grep -c "s72(1)(a) SCCs\|s72(1)(a) adequate" brief/legal/PROCESSING_PURPOSES.md # must be >= 3
grep -c "EU 2021/914\|EU Commission Implementing Decision" brief/legal/PROCESSING_PURPOSES.md  # must be >= 1
grep -c "s72(1)(e) SCCs" brief/legal/PROCESSING_PURPOSES.md                     # must equal 0

# Edit 12 (s26 exec summary)
grep -c "Summary — incidental special personal information" brief/legal/PROCESSING_PURPOSES.md  # must equal 1

# Edit 13 (s19 section)
grep -c "Security safeguards (POPIA s19)" brief/legal/PROCESSING_PURPOSES.md    # must equal 1
grep -c "Encryption in transit\|Encryption at rest" brief/legal/PROCESSING_PURPOSES.md  # must be >= 2

# Edit 14, 15, 16 (DSR, AI global, B23 override)
grep -c "does not assume responsibility" brief/legal/PROCESSING_PURPOSES.md     # must be >= 1
grep -c "assistive tools only\|Global AI safeguard" brief/legal/PROCESSING_PURPOSES.md  # must be >= 1
grep -c "Notes on retention override" brief/legal/PROCESSING_PURPOSES.md        # must equal 1

# Edit 17 (B9 corrected, no hardcoded amounts)
grep -c "R399\|R749" brief/legal/PROCESSING_PURPOSES.md                         # must equal 0
grep -c "Pleks-to-applicant service charge" brief/legal/PROCESSING_PURPOSES.md  # must be >= 1

# Edit 18 (IO designation)
grep -c "Stéan Bouwer" brief/legal/PROCESSING_PURPOSES.md                       # must be >= 1
grep -c "Information Officer — to be confirmed" brief/legal/PROCESSING_PURPOSES.md  # must equal 0

# Smoke check
tail -5 brief/legal/PROCESSING_PURPOSES.md
# Expected last line: *Source of truth: `brief/legal/PROCESSING_PURPOSES.md` in the Pleks repository.*
```

Commit message:

```
docs(legal): pre-launch revisions to POPIA processing-purpose register (v4)

Structural additions:
- Retention hierarchy rule (longest applicable period controls)
- Mixed-role processing clarification (Part A vs Part B boundary seams)
- Security safeguards (POPIA s19) consolidated section
- Incidental s26 executive summary atop Appendix C

New purposes:
- B24: FICA / KYC documentation storage for Accountable Institutions
- B25: Agency-originated direct marketing (reserved — not deployed)

Purpose corrections and enhancements:
- B3: third-party data subjects; removed hardcoded application fee amounts
  (amounts vary with underlying cost changes and belong in in-product
  disclosure, not the register)
- B5: POPIA s71(2)(a) explanation and s71(3)(c) challenge rights surfaced
- B9: application fee funds flow corrected — Pleks-to-applicant service
  charge, no portion flows to the agency under any arrangement; specific
  fee amounts removed
- B12: supplier disbursements, masked bank account numbers, suppliers as
  data subjects; retention aligned with hierarchy rule
- B22: global AI-assistive-only safeguard under POPIA s71
- B23: retention-override cross-reference for erasure workflows

Information Officer:
- Stéan Bouwer designated as Information Officer for Part A Pleks-RP
  purposes (Bouwer Property Group t/a Pleks)

Citation corrections:
- FIC Act: s22 (record-keeping duty), s23 (5yr retention), not s42/s43
- POPIA s72(1) subsection numbering corrected to match Act 4 of 2013
  (a=SCCs, b=consent, c=DS-contract, d=interest-contract, e=benefit)
- Cross-border basis language expanded with EU 2021/914 SCC framework

Other:
- POPIA s20 + s21 explicit reference to Operator Agreement mention
- DSR responsibility clarification (Pleks tooling assists; RP duty remains)

No version bump: register effective 2026-05-01 is still in the future;
revisions are pre-launch clarifications not material changes. Addresses
three-round review feedback plus founder corrections before first paying
customer onboarding.
```

---

## Outstanding (not CC's register-edit job — Stéan calendar items)

- **~~Information Officer designation~~** — resolved in v4 Edit 18 (Stéan Bouwer).
- **Information Officer postal address** — placeholder remains; to be published before first paying agency customer.
- **POPIA IR registration filing** — placeholder remains; optional but common; to be filed before first paying customer.
- **DPIA register completion** — Purposes B4 (credit checking), B5 (FitScore), B22 (composite AI DPIA) reference internal DPIA documentation that does not yet exist as a separate artefact. Pre-first-paying-customer blocker.
- **Supabase region confirmation** — Appendix A1 placeholder; update once confirmed.
- **Searchworx API access confirmation** — Appendix A12 placeholder; update when access lands.
- **Operator Agreement drafting** — instrument referenced throughout the register must exist as a separate legal document before first paying customer signs. Must incorporate POPIA s20 + s21 mandatory terms per Edit 1. Separate workstream.
- **Rejection-notice email template standardisation** — Edit 6 covers the action; no register change.

None of these block the register itself from deploying with CC's 17 in-file edits above; all are calendar items tracked for first-paying-customer go-live.

---

## Decisions explicitly made in v4 of this guide

**Rejected: Hardcoding current application fee amounts (R399 / R749) in the register.** Fee amounts vary with underlying Searchworx pricing and Pleks operating costs. Committing them to a public register either forces unnecessary re-publications or creates drift between register and product. The register describes the processing purpose; the in-product disclosure at the point of payment is the canonical source for the current amount.

**Rejected: Any agency-portion-of-fee framing.** The application fee flow is Pleks↔applicant end-to-end with no agency involvement in the funds. Any text suggesting otherwise is factually wrong and has been corrected throughout.

**Accepted (founder corrections):** B9 description rewritten; B3 Notes updated to cross-reference B9; fee amounts removed throughout; Stéan Bouwer designated as Pleks-RP Information Officer.

(All v3 decisions carry forward — see v3's decision log, which remains valid.)
