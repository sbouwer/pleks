# BUILD_65 — POPIA Customer-Facing Surface

> **Status:** Spec'd, not yet built
> **Type:** Build (cross-cutting, compliance + positioning)
> **Phase:** Phase 9 — Compliance & Legal Surfaces (second spec in phase)
> **Parent:** BUILD_00 (foundation — consent_log), BUILD_01 (auth/org), ADDENDUM_00E (Sentry scrubber + /settings/privacy consent toggle already exists)
> **Dependencies:** BUILD_61 (route alignment — authored against `/tenant/*`, `/landlord/*`, `/supplier/*` URLs; `(tenant)`, `(landlord)`, `(supplier)` route groups; `app.pleks.co.za` subdomain). BUILD_62 (MFA-fresh helper `is_mfa_fresh()` from `001_foundation.sql` §N BUILD_62 Part A — soft dependency; deployable before 62 with weaker re-auth fallback). BUILD_64 (sovereign-trust invariant + `trust_reconciliation_periods` for landlord data-subject bundle). BUILD_63 (tenant portal login events via `auth_events` + `communication_delivery_events` substrate that BUILD_65 exports consume). ADDENDUM_00E (Sentry scrubber denylist — this build adds `/api/popia/*` routes). ADDENDUM_00H (AI wrapper — this build adds `popia_export_narrative` purpose).

**Touches:** Schema amendments to `supabase/migrations/010_platform_features.sql` (new `§N BUILD_65: POPIA customer-facing surface` section — `data_subject_requests`, `popia_exports`, `privacy_policy_versions`, `retention_policies_snapshot`, all idempotent). Amendment to `001_foundation.sql` (new `§N BUILD_65` section — documentary COMMENT ON consent_log + FK soft-link from `consent_log.consent_version` to `privacy_policy_versions.version` via matching text, no hard FK). New `lib/popia/` directory (`requests.ts`, `export.ts`, `retention.ts`, `erasure.ts`). New `lib/exports/bundle.ts` (generalised manifest-hash export helper extracted from BUILD_64's pattern — BUILD_66 consumes the same). New pages: `app/(tenant)/privacy/page.tsx`, `app/(landlord)/privacy/page.tsx`, `app/(supplier)/privacy/page.tsx`, `app/(dashboard)/settings/privacy/data-subject-requests/page.tsx`, `app/(admin)/admin/popia-requests/page.tsx`, plus per-request detail + review pages. New cron `app/api/cron/popia-retention-purge/route.ts` (daily — executes retention-policy deletions). New API routes `app/api/popia/*` (request creation, bundle download, erasure execution). New Storage bucket `popia-exports` with path-scoped RLS. Updates to `app/(public)/privacy/page.tsx` (expanded privacy policy) + new `app/(public)/privacy/versions/[version]/page.tsx` (historical policy versions). New `brief/legal/PROCESSING_PURPOSES.md` — the POPIA processing-purpose register created by this build (referenced in ADDENDUM_00E and BUILD_64 as a deliverable they did not themselves create). New `brief/legal/RUNBOOK_POPIA.md` (operational runbook). New React Email templates `popia.request_received`, `popia.request_approved`, `popia.request_rejected`, `popia.nuke_confirmation`, `popia.export_ready`, `popia.policy_update`.

**Scope:** Customer-facing POPIA compliance surface for tenants, landlords, suppliers, and agencies. Seven POPIA rights exposed via a structured data-subject-request workflow with 30-day SLA enforcement. Plus an **eighth request type — full erasure ("nuke")** — as a Pleks product commitment that exceeds strict POPIA s24 and becomes a positioning differentiator: the sovereign-data twin of BUILD_64's sovereign-trust moat. Agency-gated approval for all destructive operations, with explicit regulatory carve-outs (RHA 3yr, PPRA 5yr, Tax Administration Act 5yr, consent_log immutable). Consent log viewer with immutable versioned privacy policy surface. Self-service data export in PDF + JSON + ZIP bundle with BUILD_64's manifest-hash tamper-evidence pattern. Platform-admin cross-agency operational dashboard for requests that reach Pleks directly (Operator routing to the correct Responsible Party). POPIA register formalised as `PROCESSING_PURPOSES.md` — the foundational doc both ADDENDUM_00E and BUILD_64 reference but neither creates.

**Does not touch:** automated Information Regulator breach reporting (Tier 3 — IR's eServices portal is manual submission only as of April 2026); DPIA generator (Tier 3); cross-agency data-subject-request routing (a subject with 3 leases across 3 agencies approaches each agency independently — this is correct under POPIA, each agency is its own Responsible Party); specialised identity verification beyond existing auth (magic-link + existing login + optional MFA is sufficient); consent re-capture on every policy version change (we ship the mechanism but the trigger is scoped to material changes — not cosmetic edits); Searchworx data-subject routing (Searchworx is an Operator to the agency's Responsible-Party role; subject's credit bureau data rights flow through Searchworx's own channel per their consent form). The right to lodge complaint with the Information Regulator is **surfaced as an option, never routed through Pleks** — we publish the IR's contact details and cannot stand between the subject and the regulator.

---

## 1 · Problem statement

Pleks is about to onboard its first paying agency customer. That agency is a **Responsible Party** under POPIA for every natural person whose data they hold: tenants, applicants, landlords, contractors, household members, emergency contacts, references. Pleks is their **Operator** — a processor under s1 of POPIA — handling data on their behalf under a data-processing agreement (implicit in the Terms of Service; explicit in the Operator Agreement that will be countersigned at paid-customer onboarding).

Today Pleks has:

- `consent_log` table in `001_foundation.sql` — captures every consent event with `consent_type` enum (credit_check / data_processing / marketing / trust_account_notice / popia_application / lease_template_disclaimer), `consent_version` text, IP, user agent
- `/privacy` public page — Tier-1 privacy policy planned per CLAUDE.md Task 3D but not yet rich enough to satisfy POPIA s18 notification
- `/settings/privacy` page — from ADDENDUM_00E, a consent toggle for error monitoring only
- Nothing else

What's missing and what BUILD_65 adds:

1. **A customer-facing surface for all seven POPIA rights** — access (s23), correction (s24), deletion (s24), objection (s11(3)), restriction (s24), portability (implicit in access), plus **a Pleks product commitment that exceeds POPIA — full erasure on request** — with clear pre-submission disclosure of what will and won't be deleted.
2. **A data-subject dashboard** for every role — "what data is held about me, by whom, retained until when, on what lawful basis." Separated by controller (Pleks RP data vs agency Operator data) so the subject sees the full picture but knows who to approach for what.
3. **A consent log viewer** — filterable history of every consent event, with the actual privacy policy text as it existed at the time of consent (immutable via `privacy_policy_versions`).
4. **Agency admin inbox** — `/settings/privacy/data-subject-requests` — 30-day SLA countdown, status state machine, approval flow with step-up MFA on destructive actions.
5. **Platform admin inbox** — `/admin/popia-requests` — requests that reach Pleks directly (subject writes to support instead of their agency). Per Operator role, Pleks routes to the correct Responsible Party; Pleks does not action agency data directly.
6. **Retention enforcement** — daily cron that executes retention-policy deletions on time-eligible data, with full audit trail.
7. **POPIA processing-purpose register** — `brief/legal/PROCESSING_PURPOSES.md` — the foundational doc ADDENDUM_00E and BUILD_64 both declared as a deliverable but neither created. BUILD_65 owns this file.

### Why this is urgent now

- First paying agency customer is weeks away. Operator Agreement countersigned at that onboarding requires Pleks to **have the technical infrastructure to assist the Responsible Party in responding to data-subject requests within 30 days** (POPIA s19(2)(c)). Without BUILD_65, the agency and Pleks would both be in technical breach from day one.
- The Information Regulator activated its eServices portal in 2025. Breach reports and subject complaints are now streamlined. Any POPIA-shaped gap in a new SaaS platform is exposed.
- **Pam Golding data breach, March 2025** — category risk for SA property management. Agencies now actively ask "what POPIA surface does your platform have?" during procurement. Having none is a lost sale.
- The **sovereign-trust invariant** (BUILD_64, D-TRUST-01) establishes "your client funds stay with you." BUILD_65 establishes the **sibling invariant** for data: "your client data stays with you." Without the POPIA customer surface, the sovereign-data claim is aspirational. BUILD_65 makes it verifiable.
- A formal processing-purpose register (`PROCESSING_PURPOSES.md`) is required by POPIA s17 (accountability) and s18 (notification). Every subsequent compliance spec has referenced it as if it existed. It doesn't. BUILD_65 ends the fiction.

### The positioning frame

The handover called this out and it's worth naming explicitly: BUILD_64 (sovereign trust) and BUILD_65 (sovereign data) together are the Pleks compliance moat. Competitor platforms can match our feature set. Matching the stance that **client money and client data both stay with the agency, with Pleks providing only the management layer** requires them to give up fee structures they depend on. That asymmetry is what BUILD_65 locks in.

### The nuke request — why we exceed POPIA

POPIA s24(1) provides narrower deletion rights than the GDPR's Right to be Forgotten. Strict POPIA only compels deletion of:

- Data that is **inaccurate, irrelevant, excessive, outdated, incomplete, misleading** — i.e. data-quality-motivated deletion
- Data processed **unlawfully** — i.e. without lawful basis
- Data the Responsible Party is **no longer authorised to retain** — typically because consent has been withdrawn and no other lawful basis remains

A tenant who simply no longer wants Pleks to hold their data, with no quality or unlawfulness claim, has **no absolute deletion right under POPIA** while their data is held on a lawful basis (contract, legal obligation, legitimate interest).

The **nuke request** is a product commitment that goes beyond this:

> **Pleks will delete every piece of data we are legally allowed to delete, on request, with clear pre-submission disclosure of what we cannot delete and why.**

This is stronger than POPIA. It is weaker than GDPR's absolute RTBF because SA regulatory retention obligations carve out large parts of a property-management dataset (inspection photos, trust records, lease documents) for 3–5 years.

The positioning value is high. The implementation cost is low — the same `data_subject_requests` workflow handles it with a different `request_type` value and a richer disclosure screen. The legal risk is contained because we disclose the carve-outs explicitly.

---

## 2 · Non-goals

Explicit exclusions so the spec stays bounded and future sessions don't re-litigate:

- **Automated Information Regulator breach reporting.** POPIA s22 breach notification is manual today — the IR's eServices portal accepts submissions; there is no API. Pleks surfaces the IR's contact and template text; the agency submits. Tier 3.
- **DPIA (Data Protection Impact Assessment) generator.** Some orgs run DPIAs for new processing activities. Out of scope; Tier 3.
- **Cross-agency data-subject-request routing.** A tenant with leases at three agencies makes three requests — one to each Responsible Party. Pleks does not aggregate or cross-route. Each agency handles its own. This is correct under POPIA and explicit in the Operator Agreement.
- **Searchworx-side subject rights.** Searchworx is the agency's Operator for credit bureau data; subject credit bureau rights flow through Searchworx's own Data Subject Request process as disclosed in their consent form. Pleks links out; Pleks does not relay.
- **Per-element retention override by agency.** The retention defaults (D-POPIA-02) are platform-set. Allowing per-agency override on a per-element basis creates a compliance nightmare (auditing every agency's bespoke retention schedule) and is Tier 2 if ever requested.
- **Specialised identity verification for data subject requests.** Magic-link-to-verified-email + existing authentication + optional MFA is sufficient per POPIA s23(3). We don't require passport uploads or biometric verification.
- **Policy-version re-consent UI.** BUILD_65 ships the immutable `privacy_policy_versions` table and a version-bump mechanism (`policy_update` email + in-app banner). Material-change triggered re-acceptance with a new `consent_log` row is supported in the data model. The blocking UX ("re-accept or be logged out") is Tier 2 — ships with the first material policy change post-launch.
- **POPIA certification badge.** No SA POPIA certification scheme is operational yet. When one lands, BUILD_65's surface is the precondition; certification is a separate operational exercise.
- **Right to lodge a complaint with the IR.** Pleks publishes the IR's contact details; Pleks never mediates or dissuades. The right is unconditional; Pleks's role is to make it easy to exercise.
- **Data-subject authentication for non-users.** A reference whose data is held but who has never logged into Pleks makes a request by writing to the agency. Pleks does not build a separate identity flow for non-users; the agency handles the identity check and initiates the request via the admin inbox with `subject_user_id = null` + `subject_email`.

---

## 3 · Design decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-POPIA-01 | **Pleks is Operator for agency-operated data; Responsible Party for platform account data.** The data-subject dashboard surfaces both categories distinctly. Agency data (leases, communications, inspections, trust transactions, tenant profiles): Pleks = Operator, agency = Responsible Party. Platform account data (login credentials, 2FA/passkeys, session data, Pleks-originating audit logs, in-app feedback, Sentry events): Pleks = Responsible Party. A tenant has one Pleks account (Pleks RP) but potentially multiple lease records across multiple agencies (each agency RP, Pleks Operator). | This is the foundational legal posture. Getting it wrong makes every subsequent decision incoherent. The split is load-bearing for the request-routing logic: subject rights against platform data are exercised against Pleks directly; against agency data they are exercised against the agency, with Pleks assisting per s19(2)(c). |
| D-POPIA-02 | **Retention defaults by data category.** Trust-account records 5yr from transaction date (PPRA). Lease documents + amendments 5yr post-termination (Prescription Act + PPRA practice). Inspection reports + photos 3yr post-termination (RHA evidentiary practice). Rent ledger + invoices + payment records 5yr from transaction (Tax Administration Act + PPRA). Communications (`communication_log`) **5yr post-termination** (aligned with trust records per founder call). Rejected rental applications 12mo from rejection (POPIA minimisation). Credit check results 12mo from pull OR lease termination whichever later (POPIA + bureau consent — 12mo is a practical window; credit reports themselves are only valid for 3 months per SA credit norms, but retaining for 12mo gives the agent a defensible "last view" to decide whether to renew a check rather than re-pull). `consent_log` entries forever / immutable (POPIA accountability — consent record outlives the data it authorised). `audit_log` entries 7yr (standard SA business records retention; matches BUILD_62's `auth_events` retention). Maintenance records 3yr post-completion (RHT evidentiary). Platform account (login, 2FA, sessions) deleted on account closure + 30-day grace (POPIA minimisation). | These are the defaults. Each has a cited regulatory source. The table is surfaced in `PROCESSING_PURPOSES.md` for the formal POPIA register and in the subject dashboard for transparency. Per-category granularity lets the erasure cascade do the right thing automatically. |
| D-POPIA-03 | **Eight request types.** POPIA's seven rights (access, correction, erasure, objection, restriction, portability, withdrawal-of-consent) plus a Pleks-specific `nuke` request type that exceeds POPIA. Request types map to `data_subject_requests.request_type` CHECK enum: `'access' / 'correction' / 'erasure' / 'objection' / 'restriction' / 'portability' / 'consent_withdrawal' / 'nuke'`. | Each type has distinct workflow. Access generates an export artefact; correction updates specific records; erasure runs the retention-aware purge cascade; objection flags a specific processing purpose as contested; restriction pauses processing without deletion; portability emits machine-readable; consent_withdrawal revokes a specific consent_log entry's effect going forward; nuke runs the maximum-allowed deletion with explicit carve-out disclosure. |
| D-POPIA-04 | **Agency-gated approval with 30-day SLA.** Every request — subject-initiated or agency-initiated-on-subject's-behalf — enters the `data_subject_requests` inbox at the correct agency. Agency reviews within POPIA's 30 calendar-day window (s23(1)). SLA visible as countdown on admin dashboard. Status state machine: `new → verifying_identity → under_review → approved → completed` (happy path) or `new → verifying_identity → under_review → rejected (with s24-basis documented)` or `cancelled` (subject withdraws). | Agency-gated because the agency is the Responsible Party. Subject-unilateral erasure is structurally wrong under POPIA — the subject cannot nuke regulatory records the agency is obligated to hold. 30-day SLA is statutory minimum. Visible countdown forces the agency to act rather than let requests stale. |
| D-POPIA-05 | **Nuke request = product commitment exceeding POPIA.** Pre-submission disclosure screen lists every category that will be deleted AND every category that won't be, with the specific retention date and legal basis per un-deletable category. Subject must tick "I understand" per carve-out before the request can be submitted. On approval, the erasure cascade runs with the maximum scope the retention policy allows; carve-out data is retained in a restricted-access state (quarantined from day-to-day use but legally preserved). | This is the positioning play. POPIA strict deletion is narrow; most agencies and competitors treat this as "we delete what the regulator would force us to, nothing more." Pleks commits to "we delete everything we're legally allowed to, on request, with disclosed exceptions." The disclosure is the key — a subject who requests a nuke knowing their inspection photos stay for 3 more years cannot later claim misrepresentation. The framing in the UI is the sibling to BUILD_64's sovereign-trust framing. |
| D-POPIA-06 | **Regulatory carve-outs are non-negotiable and enforced at the purge layer, not the policy layer.** `lib/popia/retention.ts` exposes `isErasableNow(category, context) → {erasable: bool, retainedUntil?: date, reason?: string}`. Every purge operation routes through this function. Inspection photos cannot be deleted while the lease is active (un-erasable) AND during the 3-year RHA retention period after termination (un-erasable). Trust transactions from closed periods cannot be deleted for 5 years (un-erasable, also locked by BUILD_64 sign-off triggers). Consent log entries never deleted (immutable by design, sits on top of POPIA accountability). The retention function is the single choke point; bypassing it is structurally prevented via ESLint `no-restricted-imports` on the underlying delete paths. | Defence in depth. Agency can't "approve" a request to delete an inspection photo during the lease — the purge layer refuses. The policy layer (request approval) knows the same rules so the admin UI shows "cannot delete: retained until 2029-03-15 per RHA s5(3)" rather than queueing a request that will fail. Having one function own the rules means updates propagate atomically. |
| D-POPIA-07 | **Correction requests follow same workflow as erasure.** Subject identifies inaccurate data; agency verifies; agency either corrects (logs corrected value + original in `audit_log`) or rejects (documents why the current value is accurate, e.g., "your name on the lease matches your ID document — unchangeable without a notarised name-change affidavit"). Corrections to ID-document-backed fields (SA ID, full name, date of birth) require supporting documentation; corrections to self-declared fields (preferred name, contact phone, emergency contact) do not. | Correction is the second-most-common right exercised. Distinguishing ID-backed from self-declared fields prevents identity-fraud vectors (a subject can't change the name on a signed lease to impersonate someone else) while keeping friction low for legitimate updates. |
| D-POPIA-08 | **Immutable versioned privacy policy.** New table `privacy_policy_versions` in `010_platform_features.sql`: `(version text PRIMARY KEY, title text, body_markdown text, body_html text, effective_from date, superseded_at date NULL, is_current boolean, change_summary text, created_by uuid, created_at timestamptz)`. The current live policy at `/privacy` renders from `is_current=true`. Historical versions accessible at `/privacy/versions/[version]`. `consent_log.consent_version` is a soft reference (text equality) to `privacy_policy_versions.version`. | Subjects are entitled to see the actual policy text they agreed to at the time of consent, not the current (possibly-materially-changed) version. Storing full markdown + compiled HTML in the table rather than referencing a filesystem artefact means the text is guaranteed to survive every kind of migration. Soft reference (no hard FK) because we don't want a missing version to cascade-delete consent records — the fallback is "policy version no longer available; contact Information Officer" which is acceptable for a legacy edge case. |
| D-POPIA-09 | **Material-change re-consent mechanism (surface only in v1).** When the privacy policy is updated with `change_type = 'material'`, affected users receive a `popia.policy_update` email and see an in-app banner the next time they log in. The banner links to the version-comparison view at `/privacy/versions/[new]?compare=[old]`. A `consent_log` entry records their acknowledgement. Non-material updates (typos, formatting, cosmetic) do not trigger the flow. The **blocking variant** (re-accept or be locked out) is Tier 2 — BUILD_65 ships the plumbing; the first material change post-launch will be the first real test. | Forcing immediate re-acceptance on every change is hostile UX. A material change is rare (probably annually or less). The soft banner + acknowledgement pattern matches SA consumer expectations and satisfies POPIA's notification requirement without breaking the product. Blocking variant is trivial to add on top of the plumbing once the first real use case arrives. |
| D-POPIA-10 | **MFA-fresh for agency-side destructive actions.** Erasure approval, nuke approval, bulk export release, and final policy publication all require `is_mfa_fresh()` per BUILD_62 Part A's 5-minute window. Subject-side actions (requesting own data export, viewing own consent history, submitting a request) require only existing auth — magic-link or password + optional MFA. Soft dependency: if BUILD_62 ships after BUILD_65, the agency-side fiduciary actions fall back to an email/password re-prompt (existing pattern from BUILD_56 ownership transfer). | Consistent with BUILD_64's fiduciary-class-action pattern. Approving an erasure is a legal-exposure act; re-auth is appropriate. Subject access to own data is a right; adding friction is wrong. Fallback ensures BUILD_65 is deployable before BUILD_62 lands without weakening the contract once 62 is live. |
| D-POPIA-11 | **Export bundle format — PDF + JSON + ZIP, manifest-hash tamper-evidence.** Every access / portability / nuke-pre-delivery request produces a three-artefact bundle: (a) PDF narrative, human-readable, "what we hold about you, when it was collected, why, retained until"; (b) JSON machine-readable, full structured dump with schema version; (c) ZIP supporting files, original signed leases, inspection photos, communications as EML. SHA-256 manifest hash of all three artefacts written to `popia_exports.manifest_hash`. Bundle download link is a signed Supabase Storage URL with 7-day expiry. | Three formats because three use cases: PDF for the subject to read and file; JSON for the subject to re-import into another system (the portability right); ZIP for the actual source-document proof. Manifest hash gives tamper-evidence — subject can prove later that the bundle they received is what Pleks issued. 7-day link TTL is standard for sensitive downloads. |
| D-POPIA-12 | **Regeneratable, never rewriteable.** Like `trust_audit_exports`, a `popia_exports` row is never mutated. Re-requesting the export creates a new row with `regeneration_of = [old_id]` + `regeneration_reason`. Immutable history of every export generated. | Subjects reasonably ask for re-copies ("lost the link", "need to give it to my attorney"). Appending rather than overwriting gives audit integrity. A subject contesting what was disclosed in April can pull the April bundle from history. |
| D-POPIA-13 | **Shared bundle library at `lib/exports/bundle.ts`.** BUILD_65 creates this library as the generalisation of BUILD_64's `lib/trust/audit-export.ts` manifest-hash pattern. BUILD_66 (Tribunal Evidence Pack) consumes it. BUILD_64's audit-export refactor to use the shared helper is **not** part of BUILD_65 — flagged as a Tier 2 refactor in follow-ons. This keeps BUILD_65 from touching BUILD_64's trust-ledger paths, which are load-bearing for the sovereign-trust invariant. | Don't refactor existing invariant-load-bearing code in a compliance spec. BUILD_65 creates the shared library; BUILD_64 keeps its local copy until a dedicated refactor ships. Duplication for 1–2 months is acceptable; touching `lib/trust/*` in BUILD_65 is not. |
| D-POPIA-14 | **Platform-account data export is separate from agency data export.** When a subject has multiple controller relationships — Pleks RP account plus two agency Operator-managed profiles — the export dashboard shows three distinct request buttons: "Request data Pleks holds about your account," "Request data Smith Realty holds (managed via Pleks)," "Request data Acme Rentals holds (managed via Pleks)." Each produces its own bundle. | Conflating controllers in one export is legally incorrect — Pleks cannot speak on the agency's behalf about the agency's data, and blurring the boundary confuses the Responsible-Party discipline. Separate buttons reinforce the sovereign-data framing: the subject sees Pleks as the account layer and each agency as the data custodian. |
| D-POPIA-15 | **Viewer-centric scoping — privacy is determined by who is viewing, not by which workspace the URL lives in.** An agency admin at `/settings/privacy/data-subject-requests` sees agency-scoped data (what the agency holds and has permission to act on). A subject at `/tenant/privacy`, `/landlord/privacy`, or `/supplier/privacy` sees subject-scoped data across every controller they have a relationship with — Pleks RP (their platform account) plus every agency Operator-managed profile they are linked to via `user_orgs_tenants` / `user_orgs_landlords` / `user_orgs_contractors`. A tenant with three tenant memberships across three agencies sees all three agencies on one `/tenant/privacy` page, each as a distinct controller card. Middleware continues to enforce URL-prefix-to-active-role match (a tenant in tenant workspace cannot reach `/landlord/privacy`); what changes is that the page queries bridge tables by `auth.uid()` rather than by `active_scope_id`. This is the single legitimate deviation from ADDENDUM_61B's single-scope-per-workspace discipline — and it is not an exception so much as a direct expression of the underlying legal reality. Agents also see `/settings/privacy/my-data` for their personal (Pleks-RP) data, following the same subject-scoped pattern. No cross-subject visibility ever — a tenant still doesn't see another tenant's data, and an agent doesn't see their client's data via the subject-side surfaces. | POPIA rights are subject rights — they are vested in the natural person, not in any particular role or controller relationship. An agency's access to subject data is scoped to what the agency holds (agency-centric); a subject's access to their own data is scoped to wherever it is held (subject-centric). The UX must express this. Forcing a tenant with leases at three agencies to switch workspaces three times and submit three separate nuke requests to exercise one right defeats the right. The viewer-centric framing also makes the design decision legible to auditors: "the agency sees what it is permitted to see; the subject sees what they are entitled to see; the two scopes are asymmetric by law." |
| D-POPIA-16 | **Agency admin inbox at `/settings/privacy/data-subject-requests`.** List view with filters by status, request_type, overdue, assigned-to. Detail view with full request context, documents attached by subject, SLA countdown, approval/rejection controls with MFA-fresh prompt, resolution_notes free-text field. Approval executes the action (erasure cascade, export generation, etc.) inline with a confirmation preview ("this will delete 47 records and mark 312 records for restricted retention — proceed?"). | The inbox is where agencies operationalise compliance. Making it a filterable list lets agencies see at-a-glance what's coming due. Inline execution with preview prevents both hesitation ("did I actually approve it?") and mistake ("I didn't realise it would delete 300 records"). |
| D-POPIA-17 | **Platform admin inbox at `/admin/popia-requests`** (JSONB platform-admin flag per BUILD_56 / ADDENDUM_00F pattern). Handles requests that reach Pleks directly — the subject emails support@pleks.co.za instead of their agency. Platform admin identifies the correct Responsible Party (possibly multiple), creates a `data_subject_requests` row per agency with the subject's details, and emails the agency admin with a pointer. Pleks does NOT action agency data directly from this inbox — this is strictly a routing surface. If the request concerns Pleks-held platform account data, Pleks actions it here per RP role. | The Operator-vs-Responsible-Party distinction requires Pleks to route, not action. Getting this wrong (Pleks unilaterally deletes agency data) would be a structural POPIA breach — Pleks would be a joint controller, destabilising the entire Operator posture. Separating routing from action at the UI level locks it in. |
| D-POPIA-18 | **`brief/legal/PROCESSING_PURPOSES.md` is created by this build.** The POPIA register — full list of every processing purpose with: purpose description, lawful basis (s11), categories of personal data processed, categories of data subjects, categories of recipients (operators, third parties, foreign transfers), retention period, cross-border flag, DPIA required flag. Every new processing purpose added by subsequent builds (e.g., BUILD_66's `tribunal_narrative`) must append a row. Version-controlled with the spec. | ADDENDUM_00E and BUILD_64 both reference this file as a deliverable they update. Neither creates it. The foundational doc is BUILD_65's territory and the right moment is now. POPIA s17 (accountability principle) requires a register; s18 (notification) requires disclosure — both anchor here. **The register is published publicly at `/privacy/processing-purposes`** (markdown canonical at `brief/legal/PROCESSING_PURPOSES.md`, rendered read-only on the public site) — this exceeds POPIA's statutory minimum. Rationale: publishing strengthens the sovereign-data positioning (competitors don't publish theirs); reduces procurement-question surface area (prospects read the register rather than emailing); supports agencies adopting Pleks by giving them a structural template they can adapt into their own register; and operationalises the transparency principle (s5(a)) rather than just complying with it. A prominent agency-framing disclaimer at the top of the public render clarifies the Operator/Responsible-Party split — the document describes Pleks's processing; each agency remains Responsible Party for data it collects and must maintain its own register. The public render does not discharge agency accountability; it describes Pleks's role so agency registers can reference it accurately. |
| D-POPIA-19 | **Information Officer published; IR complaint route published; no automation to IR.** `/privacy` page footer: named Information Officer + email + postal address + IR contact (Information Regulator, JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001 · complaints.IR@justice.gov.za · +27 10 023 5207). Data-subject-request rejection emails include the IR escalation path. Pleks never intermediates — the subject's right to complain is independent of Pleks's response. | POPIA s73(2) requires the Information Regulator's details to be disclosed whenever a subject exercises rights. Not optional. No automation because (a) the IR has no API, (b) any appearance of Pleks intermediating would create a conflict — Pleks's interest is in resolving without escalation; the subject's interest is in independent review. |
| D-POPIA-20 | **How this relates to the sovereign-trust invariant.** BUILD_64 established that client money stays with the agency; Pleks is the management layer. BUILD_65 establishes that client data stays with the agency (Pleks as Operator); Pleks is the compliance layer. The sibling invariants are the two halves of the Pleks compliance moat. Both rely on the same structural discipline: Pleks never accrues custodial authority it doesn't need. The Operator-Responsible-Party split is the POPIA expression of the "not the trustee" doctrine. Every design decision in BUILD_65 either strengthens the sovereign-data invariant or threatens it. The platform-admin routing inbox (D-POPIA-17) is the clearest test: the temptation to action agency data centrally is strong and must be resisted, exactly as BUILD_64 resisted the temptation to host trust accounts. | Per handover closing nudge. Making this explicit in the decision table keeps the doctrine alive in every subsequent session. |

---

## 4 · Data model

All DDL idempotent per CLAUDE.md amend-forward rule. Amendments appended to existing domain files; no new numbered migration files.

### 4.1 Amendment to `010_platform_features.sql` — new `§N BUILD_65` section

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_65: POPIA CUSTOMER-FACING SURFACE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Data-subject-request workflow, immutable versioned privacy policy,
-- retention-aware erasure cascade, export bundle artefacts.
--
-- See brief/build/BUILD_65_POPIA_CUSTOMER_SURFACE.md for the full spec.
-- See brief/legal/PROCESSING_PURPOSES.md for the POPIA register.
--
-- Invariant (D-POPIA-01): Pleks is Operator for agency-operated data,
-- Responsible Party for platform account data. This schema models the
-- routing and resolution of subject rights across both controllers.

-- ─── privacy_policy_versions ─────────────────────────────────────────────────
-- Immutable versioned privacy policy. consent_log.consent_version references
-- the `version` text column by soft text-equality (no hard FK — missing
-- version degrades to "text not available" fallback, not cascade deletion).

CREATE TABLE IF NOT EXISTS privacy_policy_versions (
  version                 text PRIMARY KEY,  -- e.g. '2026.1', '2026.2-material'
  title                   text NOT NULL,
  body_markdown           text NOT NULL,
  body_html               text NOT NULL,     -- pre-rendered to avoid runtime pandoc
  change_type             text NOT NULL DEFAULT 'minor'
                          CHECK (change_type IN ('minor', 'material')),
  change_summary          text,              -- what changed vs previous version
  effective_from          date NOT NULL,
  superseded_at           date,              -- NULL = currently effective
  is_current              boolean NOT NULL DEFAULT false,
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Only one current version at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_policy_single_current
  ON privacy_policy_versions(is_current)
  WHERE is_current = true;

ALTER TABLE privacy_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_policy_public_select" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_public_select" ON privacy_policy_versions
  FOR SELECT USING (true);  -- public read (policy is public by POPIA s18)

DROP POLICY IF EXISTS "privacy_policy_platform_admin_insert" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_platform_admin_insert" ON privacy_policy_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = auth.uid()
        AND uo.deleted_at IS NULL
        AND (o.settings->>'platform_admin')::boolean = true
    )
  );

-- UPDATE allowed only to flip superseded_at + is_current; body is immutable
DROP POLICY IF EXISTS "privacy_policy_platform_admin_update_supersede" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_platform_admin_update_supersede" ON privacy_policy_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = auth.uid()
        AND uo.deleted_at IS NULL
        AND (o.settings->>'platform_admin')::boolean = true
    )
  );
-- Immutability of body enforced via trigger (below)

-- ─── data_subject_requests ───────────────────────────────────────────────────
-- Every POPIA right exercised (and the Pleks nuke request type).
-- Agency-gated resolution within 30-day SLA.

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),

  -- Subject identification
  subject_user_id         uuid REFERENCES auth.users(id),  -- NULL if non-user
  subject_email           text NOT NULL,
  subject_full_name       text,                            -- captured at submission
  subject_id_last4        text,                            -- optional, for identity verification
  subject_role_context    text CHECK (subject_role_context IN
                          ('tenant', 'landlord', 'supplier', 'applicant',
                           'reference', 'emergency_contact', 'household_member',
                           'platform_account', 'other')),

  -- Request details
  request_type            text NOT NULL CHECK (request_type IN
                          ('access', 'correction', 'erasure', 'objection',
                           'restriction', 'portability', 'consent_withdrawal',
                           'nuke')),
  request_scope           jsonb DEFAULT '{}'::jsonb,
  -- Shape varies per request_type, e.g.:
  -- correction: { field_path, current_value, requested_value, supporting_docs[] }
  -- objection:  { processing_purpose_keys[], reason }
  -- consent_withdrawal: { consent_type, consent_log_id }
  -- nuke: { acknowledged_carveouts: [{ category, retained_until, reason }] }

  subject_narrative       text,              -- free-text from subject explaining request
  supporting_documents    jsonb DEFAULT '[]'::jsonb,  -- [{ storage_path, filename, uploaded_at }]

  -- Lifecycle
  status                  text NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'verifying_identity',
                                            'under_review', 'approved',
                                            'rejected', 'completed',
                                            'cancelled')),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  submitted_via           text NOT NULL DEFAULT 'portal'
                          CHECK (submitted_via IN ('portal', 'email', 'platform_admin_route', 'agency_initiated')),
  sla_deadline            date NOT NULL DEFAULT (now() + interval '30 days')::date,

  -- Resolution
  assigned_to             uuid REFERENCES auth.users(id),  -- agency staff
  resolution_notes        text,              -- why approved/rejected, carve-outs applied
  resolution_legal_basis  text,              -- s24(1)(b) obligation, s11(1)(c) legitimate interest, etc.
  resolved_at             timestamptz,
  resolved_by             uuid REFERENCES auth.users(id),

  -- Artefact linkage
  export_id               uuid,              -- FK added after popia_exports is created
  erasure_records_affected jsonb,            -- summary of what was deleted/restricted

  -- Communications
  notified_subject_at     timestamptz,       -- when resolution email sent
  notified_subject_template text,            -- which React Email template used

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_org_status
  ON data_subject_requests(org_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_sla_overdue
  ON data_subject_requests(org_id, sla_deadline)
  WHERE status IN ('new', 'verifying_identity', 'under_review');
CREATE INDEX IF NOT EXISTS idx_dsr_subject
  ON data_subject_requests(subject_user_id, submitted_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dsr_subject_email
  ON data_subject_requests(lower(subject_email), submitted_at DESC);

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Subject sees their own requests (matched by auth.uid() or email)
DROP POLICY IF EXISTS "dsr_subject_select_own" ON data_subject_requests;
CREATE POLICY "dsr_subject_select_own" ON data_subject_requests
  FOR SELECT USING (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff see their org's requests
DROP POLICY IF EXISTS "dsr_org_select" ON data_subject_requests;
CREATE POLICY "dsr_org_select" ON data_subject_requests
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Subject creates own request
DROP POLICY IF EXISTS "dsr_subject_insert" ON data_subject_requests;
CREATE POLICY "dsr_subject_insert" ON data_subject_requests
  FOR INSERT WITH CHECK (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff update their org's requests (status, assignment, resolution)
DROP POLICY IF EXISTS "dsr_org_update" ON data_subject_requests;
CREATE POLICY "dsr_org_update" ON data_subject_requests
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- No DELETE — requests are immutable history (resolution writes resolved_at, doesn't remove the row)

-- ─── popia_exports ───────────────────────────────────────────────────────────
-- Structurally similar to trust_audit_exports (BUILD_64). Manifest-hash tamper
-- evidence; regenerateable with immutable history.

CREATE TABLE IF NOT EXISTS popia_exports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid REFERENCES organisations(id),
  -- org_id NULL when this is a Pleks-RP platform-account export
  -- (not an Operator export for a specific agency)
  controller_role         text NOT NULL
                          CHECK (controller_role IN ('pleks_rp', 'agency_operator')),

  -- Subject identification (same pattern as data_subject_requests)
  subject_user_id         uuid REFERENCES auth.users(id),
  subject_email           text NOT NULL,

  -- Request linkage
  request_id              uuid REFERENCES data_subject_requests(id),
  export_type             text NOT NULL
                          CHECK (export_type IN ('access', 'portability', 'nuke_predelivery')),

  -- Artefacts (all in popia-exports Storage bucket)
  pdf_storage_path        text NOT NULL,
  json_storage_path       text NOT NULL,
  zip_storage_path        text,              -- nullable if no supporting files
  manifest_hash           text NOT NULL,     -- SHA-256 of concatenated artefact bytes
  manifest_summary        jsonb NOT NULL,    -- { artefact_paths, byte_counts, category_counts }

  -- Lifecycle
  generated_at            timestamptz NOT NULL DEFAULT now(),
  generated_by            uuid NOT NULL REFERENCES auth.users(id),
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  downloaded_at           timestamptz,       -- first download timestamp
  download_count          integer NOT NULL DEFAULT 0,

  -- Regeneration lineage (per D-POPIA-12)
  regeneration_of         uuid REFERENCES popia_exports(id),
  regeneration_reason     text,

  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popia_exports_subject
  ON popia_exports(subject_user_id, generated_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_popia_exports_request
  ON popia_exports(request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_popia_exports_org
  ON popia_exports(org_id, generated_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE popia_exports ENABLE ROW LEVEL SECURITY;

-- Subject reads own exports
DROP POLICY IF EXISTS "popia_exports_subject_select" ON popia_exports;
CREATE POLICY "popia_exports_subject_select" ON popia_exports
  FOR SELECT USING (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff read their org's exports
DROP POLICY IF EXISTS "popia_exports_org_select" ON popia_exports;
CREATE POLICY "popia_exports_org_select" ON popia_exports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- INSERT via service role only (export generation is server-side)
-- No client INSERT policy.

-- UPDATE only to record download (downloaded_at, download_count)
DROP POLICY IF EXISTS "popia_exports_subject_update_download" ON popia_exports;
CREATE POLICY "popia_exports_subject_update_download" ON popia_exports
  FOR UPDATE USING (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );
-- Write permissions to individual columns enforced by explicit UPDATE statement shape in lib/popia/export.ts
-- (UPDATE popia_exports SET downloaded_at = now(), download_count = download_count + 1 WHERE id = ...)

-- No DELETE

-- Add FK from data_subject_requests.export_id now that popia_exports exists
ALTER TABLE data_subject_requests
  DROP CONSTRAINT IF EXISTS data_subject_requests_export_id_fkey;
ALTER TABLE data_subject_requests
  ADD CONSTRAINT data_subject_requests_export_id_fkey
  FOREIGN KEY (export_id) REFERENCES popia_exports(id) ON DELETE SET NULL;

-- ─── retention_policies_snapshot ─────────────────────────────────────────────
-- Per-org snapshot of retention defaults at a point in time. Enables
-- per-org future customisation without losing the historical what-was-the-rule
-- audit trail. For Phase 1, every active org has one row matching the
-- platform defaults (D-POPIA-02). Tier 2 may add per-org overrides.

CREATE TABLE IF NOT EXISTS retention_policies_snapshot (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  effective_from          date NOT NULL DEFAULT current_date,
  superseded_at           date,
  policies                jsonb NOT NULL,
  -- Shape: { category: { retention_months: int, legal_basis: text, regulatory_source: text, erasable_during_retention: bool } }
  -- Categories match D-POPIA-02 table
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_org_current
  ON retention_policies_snapshot(org_id)
  WHERE superseded_at IS NULL;

ALTER TABLE retention_policies_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_policies_org_select" ON retention_policies_snapshot;
CREATE POLICY "retention_policies_org_select" ON retention_policies_snapshot
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Subject-facing read via SECURITY DEFINER helper (subject isn't in user_orgs for that agency)
-- See lib/popia/retention.ts getRetentionForSubject()

-- INSERT / UPDATE via service role only (platform admin manages)

-- ─── retention_purge_runs ────────────────────────────────────────────────────
-- Daily retention cron writes one row per purge execution per org, with
-- structured counts of records affected per category. Full audit trail for
-- the regulatory claim "we enforce retention automatically."

CREATE TABLE IF NOT EXISTS retention_purge_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  run_started_at          timestamptz NOT NULL DEFAULT now(),
  run_completed_at        timestamptz,
  records_by_category     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Shape: { category: { evaluated: n, deleted: n, skipped_carveout: n } }
  errors                  jsonb DEFAULT '[]'::jsonb,
  status                  text NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_purge_runs_org_started
  ON retention_purge_runs(org_id, run_started_at DESC);

ALTER TABLE retention_purge_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purge_runs_org_select" ON retention_purge_runs;
CREATE POLICY "purge_runs_org_select" ON retention_purge_runs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Service-role-only INSERT/UPDATE

-- ─── Trigger: immutable policy body ──────────────────────────────────────────
-- Once a privacy_policy_versions row is created, body_markdown and body_html
-- cannot change. Only is_current and superseded_at may flip.

CREATE OR REPLACE FUNCTION check_policy_version_immutable()
RETURNS trigger AS $$
BEGIN
  IF OLD.body_markdown IS DISTINCT FROM NEW.body_markdown
     OR OLD.body_html IS DISTINCT FROM NEW.body_html
     OR OLD.change_type IS DISTINCT FROM NEW.change_type
     OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.change_summary IS DISTINCT FROM NEW.change_summary
  THEN
    RAISE EXCEPTION 'POPIA_POLICY_IMMUTABLE: Policy content is immutable once created. Create a new version instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_policy_version_immutable ON privacy_policy_versions;
CREATE TRIGGER trg_policy_version_immutable
  BEFORE UPDATE ON privacy_policy_versions
  FOR EACH ROW EXECUTE FUNCTION check_policy_version_immutable();

-- ─── Trigger: data_subject_requests.updated_at ───────────────────────────────
DROP TRIGGER IF EXISTS trg_dsr_updated_at ON data_subject_requests;
CREATE TRIGGER trg_dsr_updated_at
  BEFORE UPDATE ON data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Storage bucket: popia-exports ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'popia-exports', 'popia-exports', false, 52428800,
  ARRAY['application/pdf', 'application/json', 'application/zip',
        'image/jpeg', 'image/png', 'message/rfc822']
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {org_id}/{subject_user_id or _email_hash}/{export_id}/{filename}
-- Platform-account exports (org_id NULL): platform/{subject_user_id}/{export_id}/{filename}

DO $DOLLAR$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'popia_exports_subject_read'
  ) THEN
    CREATE POLICY "popia_exports_subject_read" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'popia-exports'
        AND EXISTS (
          SELECT 1 FROM popia_exports pe
          WHERE (pe.pdf_storage_path = storage.objects.name
                 OR pe.json_storage_path = storage.objects.name
                 OR pe.zip_storage_path = storage.objects.name)
            AND (
              pe.subject_user_id = auth.uid()
              OR lower(pe.subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
            )
            AND pe.expires_at > now()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'popia_exports_org_read'
  ) THEN
    CREATE POLICY "popia_exports_org_read" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'popia-exports'
        AND EXISTS (
          SELECT 1 FROM popia_exports pe
          WHERE (pe.pdf_storage_path = storage.objects.name
                 OR pe.json_storage_path = storage.objects.name
                 OR pe.zip_storage_path = storage.objects.name)
            AND pe.org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
        )
      );
  END IF;
END $DOLLAR$;
-- NB: `$DOLLAR$` in the doc represents two literal dollar signs in actual SQL.
```

### 4.2 Amendment to `001_foundation.sql` — new `§N BUILD_65` section

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_65: POPIA INVARIANT DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════
-- Documentary comments on consent_log and related tables to capture the
-- POPIA posture established by BUILD_65. No new tables.
--
-- Invariant (D-POPIA-01): Pleks is Operator for agency-operated data;
-- Responsible Party for platform account data.

COMMENT ON TABLE consent_log IS
  'POPIA consent audit trail. Append-only. See BUILD_65 §4 and
   brief/legal/PROCESSING_PURPOSES.md for processing-purpose taxonomy.
   consent_version is a soft text reference to privacy_policy_versions.version
   (no hard FK). Retention: indefinite (POPIA accountability).';

COMMENT ON COLUMN consent_log.consent_version IS
  'Version of the privacy policy in effect at the time of consent.
   Matches privacy_policy_versions.version via text equality.
   Historical versions remain queryable at /privacy/versions/[version].';

COMMENT ON COLUMN consent_log.consent_type IS
  'Consent category. See brief/legal/PROCESSING_PURPOSES.md for the
   full enumeration and mapping to POPIA s11 lawful bases.
   Current enum: credit_check, data_processing, marketing,
   trust_account_notice, popia_application, lease_template_disclaimer.';
```

### 4.3 Seed data — initial privacy_policy_versions row

A seed insert into `006_seed.sql` establishes version `2026.1` as the current policy. Text-content-only; no other changes to seed logic. Text drafted in BUILD_65 implementation; current privacy-policy content at `/privacy` (which exists per CLAUDE.md Task 3D) is the baseline.

```sql
-- Appended to 006_seed.sql
INSERT INTO privacy_policy_versions (
  version, title, body_markdown, body_html, change_type,
  change_summary, effective_from, is_current, created_at
)
VALUES (
  '2026.1',
  'Pleks Privacy Notice',
  -- {{full markdown from brief/legal/PRIVACY_POLICY_2026_1.md}}
  -- {{full compiled HTML}}
  'minor',
  'Initial POPIA-compliant privacy notice. Aligned with BUILD_65 customer-facing surface.',
  '2026-05-01',
  true,
  now()
)
ON CONFLICT (version) DO NOTHING;
```

### 4.4 Seed data — initial retention_policies_snapshot per org

A helper function `seed_default_retention_policies(org_uuid)` called at org creation (see BUILD_01 onboarding) writes the D-POPIA-02 defaults into `retention_policies_snapshot`. Active orgs at migration time backfill via a one-shot query in the §N BUILD_65 migration section tail.

---

## 5 · Workflows

### 5.1 Request submission — subject-initiated

Subject navigates to `/tenant/privacy` (or `/landlord/privacy`, `/supplier/privacy` — same pattern). Dashboard shows:

```
┌────────────────────────────────────────────────────────────────────┐
│ Your data & privacy — across all Pleks workspaces                   │
│                                                                      │
│ Your POPIA rights are held by you as a person. You see every         │
│ controller we know has data about you, regardless of which           │
│ workspace you're currently signed into.                              │
│                                                                      │
│ What Pleks holds about your account (Pleks is the Responsible Party)│
│                                                     Open Request → │
│   Login, sessions, platform activity                                │
│   Retention: 30 days after account closure                          │
│                                                                      │
│ Data held by agencies you are linked to (each agency is the         │
│ Responsible Party; Pleks is the Operator)                            │
│                                                                      │
│   Smith Realty — Tenant at 5 Oak Ave                 Open Request → │
│     Lease, inspections, communications, payments                    │
│     Retention: varies by category — see details                     │
│                                                                      │
│   Acme Rentals — Tenant at 42 Beach Rd               Open Request → │
│     Lease, deposit, communications                                  │
│     Retention: varies by category — see details                     │
│                                                                      │
│ Your consent history                                 View all →    │
│                                                                      │
│ Previous data requests                               View all →    │
└────────────────────────────────────────────────────────────────────┘
```

Tapping "Open Request" opens a sheet with request-type picker:

- **Access** — get a copy of what's held
- **Correction** — report inaccurate data
- **Erasure** — request deletion of specific data (subject to legal retention)
- **Objection** — object to a specific processing purpose
- **Restriction** — pause processing without deletion
- **Portability** — machine-readable export of data you provided
- **Consent withdrawal** — withdraw a specific consent
- **Full erasure (nuke)** — delete everything we're allowed to delete (with disclosure)

Selecting a type shows the relevant form; the nuke type shows the carve-out disclosure screen first.

### 5.2 Nuke request — pre-submission disclosure

Submission flow:

**Screen 1 — what we'll delete:**

```
You've asked to delete everything Smith Realty holds about you
through Pleks. Here's what that means.

We'll delete:
 ✓  Your tenant profile, contact details, emergency contacts
 ✓  Your household member list
 ✓  Your communication history (SMS, WhatsApp, email content)
 ✓  Your maintenance request history
 ✓  Your application form (if applicable and outside the 12-month
    retention window)
 ✓  Your portal account and login history

We can mark as anonymised (name, ID, contact replaced with
"[Former tenant]") but keep the underlying record:
 ◑  Rent payment ledger (retained 5 years — Tax Administration Act)
 ◑  Trust account transactions (retained 5 years — PPRA)

We cannot delete yet:
 ✗  Your signed lease documents (retained 5 years after lease end —
    Prescription Act)
 ✗  Inspection reports and photos
    Retained during the lease + 3 years after end (Rental Housing Act)
    Your lease ends 2027-01-31 → eligible for deletion from 2030-02-01
 ✗  Your record on the consent log (immutable — POPIA accountability)

I understand what will and won't be deleted.  [ ]
```

**Screen 2 — agency review & SLA:**

```
Smith Realty will review your request within 30 calendar days
(by 2026-05-20).

You'll receive an email when:
 • Your identity has been verified
 • The request has been approved or rejected
 • The deletion has been completed

If you don't hear back by 2026-05-20, you have the right to complain
to the Information Regulator of South Africa:
  Email: complaints.IR@justice.gov.za
  Phone: +27 10 023 5207

[Submit request]                                      [Cancel]
```

Submission writes `data_subject_requests` row with `request_type='nuke'`, `request_scope.acknowledged_carveouts = [...]` (structured carve-outs the subject ticked), `status='new'`. Agency admin is notified via the `popia.request_received` email template.

### 5.3 Agency review & approval

Agency admin opens `/settings/privacy/data-subject-requests/[id]`. Detail view shows full request context, carve-out acknowledgements, subject's identity verification status, SLA countdown.

**Identity verification** (when subject is a known user): automatic — `subject_user_id` is set and the magic-link or authenticated session created the request. Status auto-advances from `new` → `under_review`.

**Identity verification** (when subject is not a user, submitted via agency-initiated or platform-admin-route): manual — agent uploads supporting documentation (ID copy, bank statement, lease document), checks "identity verified" box, status advances to `under_review`.

**Approve:**
- MFA-fresh check (per BUILD_62 Part A — re-auth if >5 min)
- Preview what will happen: "This will create an export bundle with X documents, or delete Y records and anonymise Z records. Proceed?"
- Execution inline: `lib/popia/erasure.ts` for erasure/nuke; `lib/popia/export.ts` for access/portability.
- On success: status → `completed`, `resolved_at`, `notified_subject_at` set, email dispatched.

**Reject:**
- Agent selects a rejection reason with legal basis (s24(1)(b) obligation, s11(1)(c) legitimate interest, inaccurate identity claim, duplicate of request [id], etc.)
- Free-text `resolution_notes` required
- Status → `rejected`, subject notified with `popia.request_rejected` template including IR escalation path

### 5.4 Erasure cascade (including nuke)

`lib/popia/erasure.ts` exposes `executeErasure(request: DataSubjectRequest) → ErasureResult`. Logic:

1. **Gather** — identify every table and row scoped to the subject (across contacts, tenants, landlords, suppliers, households, leases, lease_parties, applications, inspections, maintenance_requests, communication_log, deposit_transactions, payments, consent_log, etc.).

2. **Classify per category** — each row mapped to a retention category per `PROCESSING_PURPOSES.md`.

3. **Per-row decision** via `isErasableNow(category, {lease_active, termination_date, created_at})`:
   - Erasable → delete (for nuke: full delete; for targeted erasure: delete if in scope)
   - Not erasable → skip with reason logged
   - Anonymisable → replace identifying fields with `[redacted]` or `[former tenant]` keeping structural record (retained for audit but not linkable to the individual)

4. **Execute** in a transaction per row-group, with full audit log entry per operation:
   - `audit_log` row type `popia_erasure`, `record_id = source row id`, `values = {before, after, category, decision}`

5. **Summarise** → `data_subject_requests.erasure_records_affected = {by_category: {deleted: n, anonymised: n, retained: n}}`.

6. **Notify** — `popia.nuke_confirmation` (for nuke) or `popia.request_approved` (for targeted erasure) emailed to subject with the summary.

7. **Handle restricted retention** — rows that were anonymised or retained are moved into a restricted-access logical state via a `restricted_at` column pattern on affected tables (where appropriate). These rows are invisible to the agency in day-to-day views; only explicit "restricted records (former subjects)" views surface them.

### 5.5 Export generation — access / portability / nuke-pre-delivery

`lib/popia/export.ts` exposes `generateExport(request, options) → PopiaExport`.

**PDF artefact** (`lib/popia/export/pdf.ts` via existing `pdf` skill):
- Cover: subject name, requesting date, controller (Pleks or agency name), report date, manifest hash
- §1 Identity: full profile fields held
- §2 Leases: each active and historical lease with dates, property, parties
- §3 Communications: inventory with counts per channel + date range
- §4 Inspections: list with dates, outcomes
- §5 Financial records: rent ledger summary, deposit status, arrears history
- §6 Consent: all `consent_log` entries
- §7 Retention map: per-category retention status + eligible-for-deletion date
- §8 How to exercise further rights (correction/erasure/etc.)
- §9 Information Officer + IR contacts

**JSON artefact**: structured dump matching a schema in `lib/popia/export/schema.ts` (versioned — `schema_version: "2026.1"` in payload). Machine-workable. Includes every row the PDF narrative references, with full field-level detail.

**ZIP artefact** (if scope includes supporting documents): `signed_lease_[id].pdf`, `inspection_[id]_[date].pdf`, `communication_[id].eml`, `deposit_receipt_[id].pdf`, etc. Streamed from Supabase Storage (original photos, original signed leases) into ZIP builder.

**Manifest hash**: SHA-256 of SHA-256(pdf) || SHA-256(json) || SHA-256(zip). Written to `popia_exports.manifest_hash` alongside individual per-artefact hashes in `manifest_summary`.

**Optional AI narrative** (Sonnet via `lib/ai/client.ts` with purpose `popia_export_narrative`): for access requests, a natural-language summary section ("Smith Realty has held your data since 15 March 2024 when you applied for the property at 123 Oak Road. You signed a lease on 1 April 2024 ...") precedes the structured sections. Optional toggle at request time; agencies on Firm tier default to including, other tiers default to structured-only. AI cost attributed via ADDENDUM_00H.

Storage paths: `{org_id}/{subject_user_id_or_email_hash}/{export_id}/report.pdf` etc. Platform-account exports: `platform/{subject_user_id}/{export_id}/report.pdf`.

### 5.6 Retention purge cron

`app/api/cron/popia-retention-purge/route.ts` runs daily at 03:30 SAST (01:30 UTC, `30 1 * * *`). Per active org:

1. Create `retention_purge_runs` row with `status='running'`
2. For each retention category in `retention_policies_snapshot.policies`:
   - Query eligible rows (e.g., `applications WHERE status='rejected' AND decided_at < now() - interval '12 months'`)
   - Per row, call `isErasableNow` — skip if blocked by an active legal hold (set by an open `data_subject_requests` with `request_type='restriction'`)
   - Delete or anonymise per category rules
   - Log each operation to `audit_log` with `event_type='retention_purge'`
3. Update `retention_purge_runs.records_by_category` with counts, set `status='completed'`, `run_completed_at=now()`
4. Post to Better Stack heartbeat URL `HEARTBEAT_POPIA_RETENTION_PURGE` per ADDENDUM_00G pattern
5. On error: `status='failed'`, `errors=[{category, error_message}]`, Sentry captured with tag `cron: 'popia-retention-purge'`

Critical constraints:
- Purge never touches `consent_log` (D-POPIA-02 — indefinite retention)
- Purge never touches signed-off `trust_reconciliation_periods` or their related `trust_transactions` (BUILD_64 invariant)
- Purge always respects `lib/popia/retention.ts` decisions — no inline retention logic

### 5.7 Consent withdrawal

Subject clicks "Withdraw consent" on a specific `consent_log` row in the consent history view. Special request_type `consent_withdrawal` with `request_scope = { consent_type, consent_log_id }`. Agency review verifies the withdrawal is for a consent-based processing purpose (withdrawing a contract-basis or legal-obligation-basis processing has no effect per POPIA).

On approval:
- New `consent_log` row with `consent_given = false`, `consent_type` same as original
- Downstream processing that relied on the withdrawn consent is paused (e.g., marketing consent withdrawal flags the contact in `communication_preferences` as unsubscribed for marketing channel)
- The original consent record is **not** deleted (POPIA accountability — we retain the history that consent was given + withdrawn, with timestamps)

---

## 6 · Surfaces

### 6.1 Tenant portal — `/tenant/privacy`

Dashboard structure per §5.1. Sub-routes:

- `/tenant/privacy/requests` — list of subject's own requests across all agencies + Pleks
- `/tenant/privacy/requests/new` — request creation (routes to type picker → form)
- `/tenant/privacy/requests/[id]` — request detail view (status, SLA, resolution if completed)
- `/tenant/privacy/consent-history` — every `consent_log` entry with policy-version link
- `/tenant/privacy/exports/[id]` — export bundle download page (7-day TTL, download count visible)
- `/tenant/privacy/retention` — per-category retention dashboard ("your data, by type, held until...")

### 6.2 Landlord portal — `/landlord/privacy`

Same pattern as tenant, scoped to landlord-side data: properties, trust-summary records (from BUILD_64 landlord view), broker relationships, communications addressed to them. Cross-links to `/landlord/trust-summary` (BUILD_64) via the retention dashboard — landlord's deposit records are explicitly 5-year-retained per trust rules.

### 6.3 Supplier portal — `/supplier/privacy`

Same pattern, scoped to supplier-side data: job history, invoices issued, payments received, contractor FFC/PPRA registration details if captured. Narrowest dataset; simplest surface.

### 6.4 Agency workspace — `/settings/privacy/*`

- `/settings/privacy/data-subject-requests` — inbox (list + filters)
- `/settings/privacy/data-subject-requests/[id]` — detail view with approval/rejection controls
- `/settings/privacy/my-data` — agent's own Pleks-RP data (same as tenant's `/tenant/privacy` pattern but for agent's platform account)
- `/settings/privacy/retention` — org's retention policies view (read-only in v1; per-agency override is Tier 2)
- `/settings/privacy/compliance-dashboard` — aggregate stats: open requests, overdue, approved-this-month, consent coverage by tenant, un-consented contacts list (for agencies who need to chase consent for legacy imports)
- `/settings/privacy/information-officer` — org's Information Officer details (editable by org admin, flows into emails + policy page)

### 6.5 Platform admin — `/admin/popia-requests`

Platform-admin JSONB-flagged per BUILD_56 / ADDENDUM_00F pattern. Cross-agency routing inbox:

```
┌────────────────────────────────────────────────────────────────────┐
│ POPIA requests to Pleks — routing inbox                             │
│                                                                      │
│ Subject wrote to support@pleks.co.za instead of their agency.       │
│ Route to the correct Responsible Party.                             │
│                                                                      │
│ J Faure — 2026-04-18 (2 days ago)                                   │
│   Request: erasure                                                   │
│   Claimed agencies: Smith Realty, Acme Rentals                      │
│   Action: [Route to Smith Realty]  [Route to Acme Rentals]         │
│                                                                      │
│ K Ntuli — 2026-04-20 (today)                                        │
│   Request: access, Pleks platform account data                      │
│   Action: [Handle directly — Pleks RP]                              │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

Routing creates a `data_subject_requests` row at the target agency with `submitted_via='platform_admin_route'` and `subject_narrative` carried forward. Email to agency admin via `popia.request_received`. Pleks-RP handling (platform account data) flows through the same request table with `org_id = NULL` and `controller_role='pleks_rp'`.

### 6.6 Public surfaces

- `/privacy` — current policy (renders `privacy_policy_versions` where `is_current=true`)
- `/privacy/versions` — historical versions index
- `/privacy/versions/[version]` — specific version view
- `/privacy/versions/[version]?compare=[other]` — side-by-side diff (Tier 2: replaces this with semantic change summary)
- `/privacy/processing-purposes` — **full POPIA processing-purpose register**, publicly rendered from `brief/legal/PROCESSING_PURPOSES.md`. Agency-framing disclaimer at top states the register describes Pleks's own processing; each agency remains Responsible Party for data it collects and must maintain its own register. Rendered read-only via markdown → HTML at build time; canonical source is the markdown file committed to the repo. Appendices A–F cover recipients/operators, cross-border transfer schedule with s72 basis per transfer, special personal information (s26) map, DPIA framework, Information Officer contact, and how-to-exercise-your-rights quick reference.
- `/privacy/information-officer` — Information Officer + IR contact details, per-agency (each agency publishes their own IO; Pleks publishes its own for platform account data)
- `/for-agents/sovereign-data` — marketing page (public, SEO-indexed) — mirrors `/for-agents/trust-account` (BUILD_64) structure explaining the sovereign-data stance

### 6.7 Email templates

New React Email templates at `emails/popia/`:

- `request_received.tsx` — acknowledgement of a new request with SLA deadline
- `request_under_review.tsx` — after identity verification
- `request_approved.tsx` — resolution email with link to export / confirmation of erasure
- `request_rejected.tsx` — with s24 basis + IR escalation path
- `nuke_confirmation.tsx` — summary of what was deleted, what was retained, why
- `export_ready.tsx` — download link + 7-day TTL warning
- `policy_update.tsx` — material change notification with diff link

All via `lib/comms/send-email.ts` (ADDENDUM_48A). Tone: professional-single-voice (legal-mandatory, no tone variants per BUILD_63 design principle 5).

---

## 7 · The library layer

### 7.1 `lib/popia/requests.ts`

Viewer-centric discipline (D-POPIA-15): the subject-side helpers take a
`user_id` and enumerate memberships across bridge tables. The agency-side
helpers take an `org_id` and scope to that agency. The two paths are
deliberately separate — it should be syntactically impossible to call a
subject-side helper with an `org_id` parameter or vice versa.

```typescript
// Server action API — all functions called from server components / server actions

// ─── Subject-side (viewer-centric, spans all controllers) ────────────────────

export async function listControllersForSubject(userId: string):
  Promise<ControllerCard[]>
// Queries user_orgs_tenants ∪ user_orgs_landlords ∪ user_orgs_contractors
// by user_id; returns one ControllerCard per distinct org_id plus a
// synthetic ControllerCard for Pleks RP (the platform account).

export async function createDataSubjectRequest(
  input: CreateDataSubjectRequestInput
): Promise<DataSubjectRequest>

export async function transitionRequestStatus(
  requestId: string,
  to: RequestStatus,
  context: { actor_user_id: string; legal_basis?: string; notes?: string }
): Promise<DataSubjectRequest>

export async function assignRequest(
  requestId: string,
  assignee_user_id: string
): Promise<DataSubjectRequest>

// ─── Agency-side (agency-centric, scoped to one org) ─────────────────────────

export async function getOverdueRequests(orgId: string): Promise<DataSubjectRequest[]>

export async function getRequestStats(orgId: string, periodMonths: number):
  Promise<{ open: number; completed: number; rejected: number; avg_resolution_days: number }>
```

### 7.2 `lib/popia/retention.ts`

```typescript
export type RetentionDecision =
  | { erasable: true }
  | { erasable: false; retained_until: Date; reason: string; legal_basis: string }
  | { anonymisable: true; retain_shell: true; reason: string }

export async function isErasableNow(
  category: DataCategory,
  context: { orgId: string; lease_active?: boolean; termination_date?: Date; created_at: Date }
): Promise<RetentionDecision>

export async function getRetentionPolicies(orgId: string):
  Promise<RetentionPoliciesSnapshot>

// Public-facing for subject dashboard — bypasses user_orgs check
export async function getRetentionForSubject(
  subjectUserId: string,
  orgId: string
): Promise<{ category: DataCategory; decision: RetentionDecision }[]>

export async function getErasureEligibleDate(
  category: DataCategory,
  context: { lease_active: boolean; termination_date?: Date; created_at: Date }
): Promise<Date | null>  // null = never erasable (e.g., consent_log)
```

### 7.3 `lib/popia/erasure.ts`

```typescript
export type ErasureScope =
  | { type: 'targeted'; categories: DataCategory[] }
  | { type: 'nuke'; acknowledged_carveouts: AcknowledgedCarveout[] }

export async function previewErasure(
  subjectIdent: SubjectIdentification,
  orgId: string,
  scope: ErasureScope
): Promise<ErasurePreview>
// Returns counts per category without deleting anything — used for agency admin preview

export async function executeErasure(
  request: DataSubjectRequest,
  actor_user_id: string
): Promise<ErasureResult>
// Inside transaction; writes audit_log per row; returns summary

export async function anonymiseRecord(
  table: string,
  recordId: string,
  anonymisation: AnonymisationTemplate
): Promise<void>
// Used for rows that must be retained as shells but stripped of identifying PII

// Guard: this module uses db.rpc() for raw delete paths, and ESLint
// no-restricted-imports blocks raw table DELETEs from other files.
```

### 7.4 `lib/popia/export.ts`

```typescript
export async function generateExport(
  request: DataSubjectRequest,
  options: ExportOptions
): Promise<PopiaExport>
// Generates PDF + JSON + ZIP, uploads to Storage, writes popia_exports row,
// returns signed download URLs.

export async function regenerateExport(
  originalExportId: string,
  reason: string,
  actor_user_id: string
): Promise<PopiaExport>

export async function recordDownload(exportId: string): Promise<void>
// Bumps download_count + sets downloaded_at on first download

// AI-narrative helper (optional per tier)
export async function generateAccessNarrative(
  subjectData: SubjectDataBundle
): Promise<string>
// Calls lib/ai/client.ts with purpose='popia_export_narrative'
```

### 7.5 `lib/exports/bundle.ts` — new shared library

```typescript
// Generalised from BUILD_64's trust-audit-export pattern. BUILD_66 also consumes.
// BUILD_64's lib/trust/audit-export.ts is NOT refactored in this build — Tier 2 follow-on.

export type BundleArtefact = {
  name: string
  content_type: 'application/pdf' | 'application/json' | 'application/zip' | string
  bytes: Buffer | Uint8Array
}

export type BundleResult = {
  manifest_hash: string            // SHA-256 of concatenated SHA-256 per artefact
  artefact_hashes: Record<string, string>  // per-artefact SHA-256
  total_bytes: number
  storage_paths: Record<string, string>
}

export async function generateBundle(
  artefacts: BundleArtefact[],
  bucket: string,
  pathPrefix: string
): Promise<BundleResult>

export async function verifyBundle(
  bucket: string,
  storage_paths: Record<string, string>,
  expected_manifest_hash: string
): Promise<{ valid: boolean; mismatches?: string[] }>

export function signedDownloadUrl(
  bucket: string,
  storage_path: string,
  ttlSeconds: number
): Promise<string>
```

---

## 8 · MFA-fresh integration

Per D-POPIA-10 and BUILD_62 Part A's `is_mfa_fresh()` helper. Agency-side actions requiring MFA-fresh:

- Approving an erasure request
- Approving a nuke request
- Releasing an export bundle to a subject (generating the download link)
- Publishing a new material privacy policy version
- Editing retention policies (when Tier 2 per-agency override ships)

Pattern: each server action wraps `requireMfaFresh(user_id, action_name)` at top. If MFA-fresh check fails, server action returns `{ error: 'mfa_required', redirect: '/settings/security/step-up?return_to=...' }` and UI surfaces the step-up flow from BUILD_62 §8.4.

Soft fallback (deployable before BUILD_62 ships): email/password re-prompt via existing BUILD_56 ownership-transfer pattern. Replaced inline when BUILD_62 lands — grep-findable by the `requireMfaFresh` import marker.

---

## 9 · Integration with other specs

### 9.1 BUILD_64 (sovereign trust account)

- Landlord export includes trust attestation excerpt from `trust_reconciliation_periods` for the periods covering their active leases — read-only, attested to agency-owned data, never Pleks-custodied (per BUILD_64 invariant)
- Nuke request against a lease with active deposit transactions: deposit records are retained per 5-year PPRA rule (carve-out), anonymised subject fields replace name/ID on the trust transaction record so the ledger remains but can't identify the individual
- Erasure never triggers a trust transaction mutation — BUILD_64 triggers on `trust_transactions` block UPDATE/DELETE against closed periods regardless of source

### 9.2 BUILD_63 (tenant communication lifecycle)

- `communication_log` rows in scope for subject access (D-POPIA-02 — 5yr post-termination retention)
- `communication_delivery_events` included in subject's access export for Tribunal-adjacent transparency
- `tenant_portal_login` events from `auth_events` (BUILD_62) surface in the subject dashboard as login history
- Erasure of communications: body_full redacted, shell row retained for audit (template version + timestamp + delivery event outcomes preserved; PII content redacted)

### 9.3 BUILD_62 (authentication security)

- MFA-fresh helper used per §8 — soft dependency with documented fallback
- `auth_events` surface in subject's access export (login history, device changes, session creations)
- Passkey records from BUILD_62 Part B included in Pleks-RP export when applicable

### 9.4 BUILD_61 (route alignment)

- Hard dependency on the URL namespace — BUILD_65 authors against `/tenant/*`, `/landlord/*`, `/supplier/*`
- Route-manifest addition: all `/api/popia/*` routes registered with the tenant/landlord/supplier/agent role access matrix
- **New route category `cross_scope_subject_page`** registered in `lib/routing/manifest.ts` for `/tenant/privacy/*`, `/landlord/privacy/*`, `/supplier/privacy/*`. Middleware behaviour unchanged (URL prefix must match active role); the category is a marker for the pages themselves to read, signalling that the underlying query layer should use viewer-centric enumeration (D-POPIA-15) rather than single-scope active-workspace resolution. Agency-side privacy surfaces (`/settings/privacy/*`) remain in the standard `agent_org_scoped` category — agency-centric as usual.

### 9.5 ADDENDUM_00E (Sentry)

- `/api/popia/*`, `/tenant/privacy`, `/landlord/privacy`, `/supplier/privacy`, `/settings/privacy/*`, `/admin/popia-requests`, `/privacy/*` — all added to Sentry scrubber denylist. Free-text narratives + supporting documents may contain significant PII; no request bodies go to Sentry.
- Error events from POPIA routes include only `request_id`, `org_id`, `event_type` — no subject identifiers.
- `SovereignDataViolation` exception class for when Pleks-RP boundary is crossed inappropriately (structural bug — always pages)

### 9.6 ADDENDUM_00F (user feedback)

- New category tag "privacy" added to feedback picker — per-category insight into POPIA UX friction
- Feedback submissions from subjects exercising rights get a flag in the inbox so platform-admin notices POPIA-adjacent noise

### 9.7 ADDENDUM_00G (uptime)

- `popia-retention-purge` cron added to `DAILY_CRONS` list in `lib/observability/health.ts`
- Better Stack heartbeat `HEARTBEAT_POPIA_RETENTION_PURGE` created, 48h staleness threshold
- `/api/popia/request` added to rate-limit-test list (subject-initiated endpoints need abuse protection)

### 9.8 ADDENDUM_00H (cost observability)

- New `AiPurpose` enum value `'popia_export_narrative'` in `lib/ai/client.ts`
- Export-narrative AI calls metered per org via existing `ai_usage` table
- No PII in `ai_usage.metadata` — purpose-specific structure only (`{ export_type, artefact_count }`, never subject identifiers)

### 9.9 BUILD_56 (permissions)

- `/admin/popia-requests` and `/settings/privacy/data-subject-requests` admin controls gated by `user_orgs.is_admin = true` — platform-admin JSONB flag for the former, org-admin boolean for the latter
- Ownership transfer (BUILD_56) must write a `data_subject_requests`-adjacent audit entry when the data-subject role of an owner is affected

### 9.10 BUILD_66 (Tribunal Evidence Pack)

- BUILD_65 creates `lib/exports/bundle.ts` — BUILD_66 consumes unchanged
- BUILD_65's POPIA export format informs (but does not duplicate) BUILD_66's Tribunal pack — different audiences, different artefact boundary
- A Tribunal pack generated for an active dispute cannot be erased while the dispute is open — new retention carve-out added to `isErasableNow` when BUILD_66 ships

### 9.11 Searchworx (out-of-scope but must link out)

- Subject credit-bureau rights flow through Searchworx's own DSR process
- Pleks's privacy page links to Searchworx's POPIA notice + DSR channel
- Pleks's retention policy for credit check results (12mo — D-POPIA-02) applies to Pleks's cache of Searchworx results; Searchworx's own retention applies to bureau-side data

---

## 10 · How this relates to the sovereign-trust invariant

Per the handover's closing nudge, every Phase 9 spec carries this subsection.

BUILD_64 established **D-TRUST-01: "Pleks is not the trustee."** Client money stays with the agency; Pleks is the management layer. The invariant is enforced at schema, code, ESLint, and UI levels.

BUILD_65 establishes the sibling invariant:

> **D-POPIA-SIBLING: "Pleks is not the Responsible Party for agency-operated data."**

Client data stays with the agency's legal responsibility; Pleks is the compliance layer. The invariant is expressed in:

- **Schema:** `data_subject_requests.org_id` is NOT NULL when the request targets agency data; `controller_role` on `popia_exports` explicitly distinguishes `pleks_rp` from `agency_operator`
- **Code:** `lib/popia/retention.ts` and `lib/popia/erasure.ts` route agency-data operations through agency-scoped paths; Pleks-RP data operations through a separate path. No shared code that could accidentally cross the boundary.
- **UI:** `/admin/popia-requests` is explicitly a **routing inbox**, never an execution inbox for agency data. The wording on every action button reinforces this. Pleks actions platform data only.
- **Doctrine:** `brief/legal/PROCESSING_PURPOSES.md` declares the controller for every purpose. Any new processing purpose that would make Pleks the controller for agency-operated data requires an explicit spec addendum with legal review.

The structural temptation to violate this is the same as BUILD_64's trustee temptation: a platform admin gets a subject request that the agency is ignoring and wants to "just handle it." That move is exactly as wrong as Pleks moving funds "just to help." The D-POPIA-17 routing-only discipline is the POPIA expression of BUILD_64's assert-Pleks-is-not-the-trustee guard.

**On the viewer-centric privacy surface (D-POPIA-15) and the Operator/RP boundary.** Showing a tenant all three of their agency-held profiles on one `/tenant/privacy` page does NOT cross the Operator/RP boundary. The subject is the natural person exercising a right held at the natural-person level; aggregating for display is not aggregating for custody. The agency-side surface remains strictly agency-scoped (the agency sees only its own data); the subject-side surface is subject-scoped across controllers (the subject sees their own data everywhere it is held); request execution still routes to the relevant Responsible Party per D-POPIA-17. Scope asymmetry is a feature of POPIA's design — it reflects that the subject's right and the agency's permission are different things. The sovereign-data invariant is preserved.

**Twin moats. One architectural discipline: Pleks never accrues custodial authority it doesn't need.**

---

## 11 · Rollback

Three levels:

1. **Soft disable — hide the request submission UI.** Remove tenant/landlord/supplier `/privacy/requests/new` pages. Existing inboxes remain visible for in-flight requests; subjects must email support for new requests during rollback. ~30 min.

2. **Pause the cron.** Remove `popia-retention-purge` from `vercel.json`. Retention-eligible data stops being purged automatically; existing requests still resolvable. Storage continues to grow past retention windows until cron resumes. ~5 min. Must be followed by manual backfill when re-enabled.

3. **Hard disable — drop the tables.**
   ```sql
   DROP TABLE IF EXISTS retention_purge_runs CASCADE;
   DROP TABLE IF EXISTS retention_policies_snapshot CASCADE;
   DROP TABLE IF EXISTS popia_exports CASCADE;
   DROP TABLE IF EXISTS data_subject_requests CASCADE;
   DROP TABLE IF EXISTS privacy_policy_versions CASCADE;
   DROP TRIGGER IF EXISTS trg_policy_version_immutable ON privacy_policy_versions;
   DROP FUNCTION IF EXISTS check_policy_version_immutable();
   ```
   Removes the customer-facing surface. `consent_log` remains untouched. `PROCESSING_PURPOSES.md` stays in the repo. Revert `lib/popia/*` and `lib/exports/bundle.ts`. ~2 hours.

The invariant itself — D-POPIA-SIBLING — is not rollback-able; it's doctrine. Rolling back BUILD_65 removes the customer-facing surfaces but does not change the Operator-Responsible-Party boundary. Pleks remains the Operator. Subjects retain every POPIA right — they exercise them by writing to their agency directly (as they would with any SaaS), just without the structured Pleks surface.

---

## 12 · Acceptance criteria

### 12.1 Pre-merge (local verification)

- [ ] `010_platform_features.sql` has new `§N BUILD_65` section appended with `privacy_policy_versions`, `data_subject_requests`, `popia_exports`, `retention_policies_snapshot`, `retention_purge_runs`, trigger + storage bucket + storage policies, all idempotent
- [ ] `001_foundation.sql` has new `§N BUILD_65` section with documentary `COMMENT ON` statements for `consent_log`
- [ ] `006_seed.sql` has the initial `privacy_policy_versions` row for version `2026.1`
- [ ] `node scripts/check-schema-drift.mjs` reports zero drift
- [ ] `lib/popia/requests.ts`, `lib/popia/retention.ts`, `lib/popia/erasure.ts`, `lib/popia/export.ts` exist with declared signatures
- [ ] `lib/exports/bundle.ts` exists with generalised pattern
- [ ] ESLint `no-restricted-imports` rule added: direct table DELETEs on `contacts`, `leases`, `inspections`, `communication_log`, `maintenance_requests`, `applications`, `payments`, `deposit_transactions` rejected outside `lib/popia/erasure.ts` + `app/api/cron/popia-retention-purge/`
- [ ] New pages render with sample data:
  - `/tenant/privacy`, `/landlord/privacy`, `/supplier/privacy`
  - `/tenant/privacy/requests/new` + request detail
  - `/settings/privacy/data-subject-requests` + detail + approval flow
  - `/admin/popia-requests` routing inbox
  - `/privacy/versions/[version]`
  - `/for-agents/sovereign-data`
- [ ] 7 new React Email templates at `emails/popia/*` render without error
- [ ] `brief/legal/PROCESSING_PURPOSES.md` exists with complete POPIA register
- [ ] `brief/legal/RUNBOOK_POPIA.md` exists with operational runbook
- [ ] `CLAUDE.md` updated with pointer: "Before POPIA-adjacent work, read `brief/legal/PROCESSING_PURPOSES.md`"
- [ ] `/api/popia/*` routes added to Sentry scrubber denylist in `lib/observability/scrubbing.ts`
- [ ] `popia_export_narrative` added to `AiPurpose` enum in `lib/ai/client.ts`
- [ ] `popia-retention-purge` cron added to `DAILY_CRONS` in `lib/observability/health.ts`
- [ ] `vercel.json` has `popia-retention-purge` at `30 1 * * *` (daily 03:30 SAST)
- [ ] `npm run check` passes with zero warnings
- [ ] `npm run security:quick` passes with zero critical findings (Category 7 RLS audit must approve the new tables)

### 12.2 Post-deploy (integration)

- [ ] Subject creates an access request from tenant portal → request row created with correct org_id, subject_user_id, SLA deadline
- [ ] Agency admin sees request in inbox within 5 seconds of submission
- [ ] Agency admin approves access request → bundle generated in `popia-exports` bucket, manifest_hash populated, signed URL returned via email, 7-day TTL
- [ ] Subject downloads bundle → `downloaded_at` and `download_count` update, SHA-256 of downloaded artefacts matches manifest
- [ ] Attempting to UPDATE body_markdown on a privacy_policy_versions row raises `POPIA_POLICY_IMMUTABLE`
- [ ] Erasure request for a tenant with an active lease → lease fields retained, contact fields anonymised, inspection photos flagged un-erasable with retention date surfaced to subject
- [ ] Nuke request with carve-out acknowledgement → all erasable categories cleared, anonymisation applied, summary email delivered
- [ ] Retention purge cron runs → `retention_purge_runs` row created, per-category counts accurate, `consent_log` untouched, closed-period trust transactions untouched
- [ ] Platform admin routes an incoming support email → `data_subject_requests` row created at correct agency, agency notified
- [ ] Material policy version bumps → in-app banner appears for authenticated users, `popia.policy_update` email sent, consent acknowledgement writes new `consent_log` row
- [ ] MFA-fresh required for approval → session older than 5 minutes redirected to step-up flow (once BUILD_62 ships; pre-BUILD_62 fallback: email/password re-prompt)

### 12.3 Invariant verification

- [ ] `grep -r "pleks_rp\|agency_operator" lib/popia/` shows controller-role discipline in every export/erasure path
- [ ] `grep -rn "\.delete()\|delete from" lib/popia/erasure.ts` — every delete routed through `isErasableNow` check
- [ ] ESLint runs on a test file that imports `supabase.from('contacts').delete()` outside `lib/popia/erasure.ts` → rejected
- [ ] Subject making a request via `/admin/popia-requests` against agency data → Pleks never directly mutates the agency data; the row is routed to the agency's inbox, agency actions it
- [ ] A platform-admin attempting to directly action agency data from the routing inbox → UI shows no "execute" button for agency-data requests; only "route to agency" is available

### 12.4 Documentation

- [ ] `brief/legal/PROCESSING_PURPOSES.md` covers:
  - Every processing purpose currently in Pleks
  - Per purpose: description, lawful basis (s11), data categories, subject categories, recipients/operators, retention, cross-border flag, DPIA required
  - Controller per purpose (Pleks RP vs agency Operator)
  - Version controlled; amendments bumped via `change_log` section
- [ ] `brief/legal/RUNBOOK_POPIA.md` covers:
  - Subject request lifecycle end-to-end per request type
  - Identity verification for non-user subjects
  - Nuke request approval procedure with carve-out communication
  - Retention cron failure investigation
  - IR complaint response preparation (when a subject escalates)
  - Material policy change procedure
- [ ] `/privacy` page serves the current policy version; footer links to Information Officer + IR
- [ ] `/for-agents/sovereign-data` page is indexed by Google within 30 days of deployment

---

## 13 · Files produced

### New files

| Path | Purpose |
|------|---------|
| `lib/popia/requests.ts` | Request lifecycle server actions |
| `lib/popia/retention.ts` | Retention policy + eligibility decisions (load-bearing) |
| `lib/popia/erasure.ts` | Erasure cascade + anonymisation, the only legitimate delete path for subject data |
| `lib/popia/export.ts` | Export bundle generation (access/portability/nuke pre-delivery) |
| `lib/popia/narrative.ts` | AI-narrative helper (calls `lib/ai/client.ts` with `popia_export_narrative`) |
| `lib/exports/bundle.ts` | Shared manifest-hash bundle library (BUILD_66 also consumes) |
| `app/(tenant)/privacy/page.tsx` + subroutes | Tenant subject dashboard |
| `app/(landlord)/privacy/page.tsx` + subroutes | Landlord subject dashboard |
| `app/(supplier)/privacy/page.tsx` + subroutes | Supplier subject dashboard |
| `app/(dashboard)/settings/privacy/data-subject-requests/page.tsx` | Agency admin inbox list |
| `app/(dashboard)/settings/privacy/data-subject-requests/[id]/page.tsx` | Agency admin detail + approval |
| `app/(dashboard)/settings/privacy/my-data/page.tsx` | Agent personal data view (Pleks RP) |
| `app/(dashboard)/settings/privacy/retention/page.tsx` | Org retention policy view |
| `app/(dashboard)/settings/privacy/compliance-dashboard/page.tsx` | Agency compliance stats |
| `app/(dashboard)/settings/privacy/information-officer/page.tsx` | Org IO details |
| `app/(admin)/admin/popia-requests/page.tsx` | Platform-admin routing inbox |
| `app/(admin)/admin/popia-requests/[id]/page.tsx` | Routing detail view |
| `app/(public)/privacy/page.tsx` (expanded) | Current privacy policy render |
| `app/(public)/privacy/versions/page.tsx` | Historical versions index |
| `app/(public)/privacy/versions/[version]/page.tsx` | Specific version view |
| `app/(public)/privacy/information-officer/page.tsx` | Public IO + IR details |
| `app/(public)/privacy/processing-purposes/page.tsx` | Public render of `brief/legal/PROCESSING_PURPOSES.md` — markdown → HTML with agency-framing disclaimer banner |
| `app/(public)/for-agents/sovereign-data/page.tsx` | Marketing page |
| `app/api/popia/request/route.ts` | Subject request submission |
| `app/api/popia/request/[id]/approve/route.ts` | Agency approval endpoint |
| `app/api/popia/request/[id]/reject/route.ts` | Agency rejection endpoint |
| `app/api/popia/export/[id]/download/route.ts` | Download endpoint (records download) |
| `app/api/popia/export/[id]/regenerate/route.ts` | Regenerate endpoint |
| `app/api/cron/popia-retention-purge/route.ts` | Daily retention purge cron |
| `components/popia/RequestTypePicker.tsx` | Request creation step 1 |
| `components/popia/NukeCarveoutDisclosure.tsx` | Pre-nuke disclosure screen |
| `components/popia/RetentionDashboard.tsx` | Per-category retention display |
| `components/popia/ConsentHistoryView.tsx` | consent_log timeline |
| `components/popia/SovereignDataBadge.tsx` | Sibling to SovereignBadge (BUILD_64) |
| `emails/popia/request_received.tsx` | Request acknowledgement |
| `emails/popia/request_under_review.tsx` | Identity-verified transition |
| `emails/popia/request_approved.tsx` | Resolution with artefacts |
| `emails/popia/request_rejected.tsx` | Rejection with IR path |
| `emails/popia/nuke_confirmation.tsx` | Nuke execution summary |
| `emails/popia/export_ready.tsx` | Download link + TTL warning |
| `emails/popia/policy_update.tsx` | Material change notification |
| `brief/legal/PROCESSING_PURPOSES.md` | POPIA processing-purpose register (NEW, foundational) |
| `brief/legal/RUNBOOK_POPIA.md` | Operational runbook |
| `brief/legal/PRIVACY_POLICY_2026_1.md` | Source markdown for the initial policy version |
| `brief/build/BUILD_65_POPIA_CUSTOMER_SURFACE.md` | This spec |

### Modified files

| Path | Change |
|------|--------|
| `supabase/migrations/010_platform_features.sql` | Append `§N BUILD_65` section |
| `supabase/migrations/001_foundation.sql` | Append `§N BUILD_65` documentary section |
| `supabase/migrations/006_seed.sql` | Append initial `privacy_policy_versions` + per-org retention snapshot seed |
| `vercel.json` | Add cron `popia-retention-purge` at `30 1 * * *` |
| `lib/ai/client.ts` | Add `popia_export_narrative` to `AiPurpose` enum |
| `lib/observability/health.ts` | Add `popia-retention-purge` to `DAILY_CRONS` |
| `lib/observability/scrubbing.ts` | Add `/api/popia/*`, `/admin/popia-requests`, `/tenant/privacy`, `/landlord/privacy`, `/supplier/privacy`, `/settings/privacy/*`, `/privacy/*` routes to scrubber denylist |
| `.eslintrc.cjs` | Add `no-restricted-imports` rule blocking direct delete paths outside `lib/popia/erasure.ts` and the purge cron |
| `CLAUDE.md` | Add: "Before POPIA-adjacent work, read `brief/legal/PROCESSING_PURPOSES.md`" |
| `components/FeedbackButton.tsx` (ADDENDUM_00F) | Add "privacy" category to picker |
| `app/(public)/privacy/page.tsx` | Replace placeholder with `privacy_policy_versions` renderer |
| `lib/routing/manifest.ts` (BUILD_61) | Register `/api/popia/*` routes with role access matrix |

### External config

| Service | Change |
|---------|--------|
| Better Stack | Add `HEARTBEAT_POPIA_RETENTION_PURGE` monitor (48h threshold) |
| Supabase Storage | Create `popia-exports` bucket with path-scoped RLS (in migration) |
| Resend | No changes — all templates via existing `lib/comms/send-email.ts` |

---

## 14 · Follow-ons (not this build)

- **Tier 2 — Refactor `lib/trust/audit-export.ts` to use `lib/exports/bundle.ts`.** BUILD_65 creates the shared library; BUILD_64's audit-export keeps its local copy until a dedicated refactor ships. One spec, ~2 days, minimal risk given the shared library's test coverage by then.
- **Tier 2 — Blocking re-consent flow on material policy change.** BUILD_65 ships the plumbing + soft banner. First material change post-launch exercises the blocking variant.
- **Tier 2 — Per-agency retention policy overrides.** Some agencies may want longer retention than platform defaults (e.g., extended communication retention for Firm-tier agencies who expect Tribunal matters). `retention_policies_snapshot` schema already supports this; Tier 2 adds the admin UI + override validation ("your override must meet the platform minimum").
- **Tier 2 — Data-subject authentication beyond existing auth.** If the IR publishes guidance requiring stronger verification (e.g., ID upload + liveness check), add a specialised verification flow separate from user auth.
- **Tier 2 — Automated IR breach reporting.** When IR publishes API (currently no timeline), wire the s22 notification flow through it.
- **Tier 2 — Cross-subject visibility for joint data subjects.** Two tenants on a joint lease each make a request about the same lease — Tier 2 adds a "joint consent required for lease-wide action" pattern.
- **Tier 2 — AI-generated change-summary for material policy updates.** Currently agent writes the `change_summary` text. Opus generation of a plain-English diff would reduce friction for material bumps.
- **Tier 2 — Subject access narrative quality tuning.** Once Firm-tier customers use the AI-narrative feature, evaluate narrative quality and switch to Opus if Sonnet output is thin.
- **Tier 2 — DPIA generator.** Template-driven DPIA for agencies adding new processing (e.g., adopting a new integration). Ship when first customer asks.
- **Tier 3 — Joint controller mode.** If ever Pleks has a processing purpose where it's a joint controller with the agency (e.g., platform-wide fraud analytics), a separate spec captures the posture. Deliberately avoided in BUILD_65.
- **Tier 3 — POPIA certification surface.** When SA adopts a formal POPIA certification scheme, package BUILD_64 + BUILD_65 + audit controls as the certification evidence.

---

## 15 · Open decisions

Most pre-spec decisions were closed in the conversation that produced this spec. The remaining open items:

1. **Communications retention — 5yr vs 3yr.** Decision locked at 5yr per founder call (matches trust records). Flagging here so CC sees the thinking: some agencies running on older SA property-management platforms retain 3yr by convention. 5yr is more conservative and aligns with the Tax Administration Act; defensible. Revisit if first customer pushes back.
2. **Credit check retention — 12mo confirmed.** Locked. CC note: actual SA credit report validity is 3 months; the 12mo retention is our policy choice to give agents a defensible "last view" window for repeat applicants. Documented explicitly in `PROCESSING_PURPOSES.md`.
3. **Nuke request — cooling-off period?** POPIA doesn't mandate one. Current design: submit → 30-day review → execution. Alternative: 48-hour cooling-off after approval before execution ("you have 48 hours to cancel"). Leaning: no cooling-off for v1; POPIA's 30-day review period is effectively a cooling-off. Revisit if first customer reports post-execution regret patterns.
4. **AI narrative default — per tier.** Firm tier defaults to including narrative; Steward and below default to structured-only. Owner tier doesn't get the AI option at all (Sonnet costs add up on a free tier). Confirm this tier gating is right — alternative is "narrative is a paid add-on toggle" across all tiers. Leaning: tier-gated default with opt-out.
5. **Retention purge — soft-delete vs hard-delete.** Current design: hard delete past the retention window. Alternative: soft-delete with `retained_until` flag, hard-delete after a further grace period. Trade-off: hard-delete matches POPIA minimisation; soft-delete gives an extra safety net for buggy purge logic. Leaning: hard-delete with thorough per-category unit tests and a dry-run mode for the first 30 days.
6. **PROCESSING_PURPOSES.md — markdown vs structured format + publication stance.** Resolved. Markdown canonical at `brief/legal/PROCESSING_PURPOSES.md`; publicly rendered at `/privacy/processing-purposes` with agency-framing disclaimer; goes beyond POPIA statutory minimum as a positioning + sales-enablement lever (agencies can use the register as a structural template for their own). YAML source of truth → compiled markdown + JSON remains a Tier 2 follow-on if programmatic consumption ever warrants it (BUILD_66 Tribunal pack generator is the most likely consumer, and can parse markdown headers adequately for v1).
7. **Subject dashboard — multi-controller view separation.** D-POPIA-14 separates Pleks RP from each agency Operator as distinct "Request data" buttons. Alternative: single "Request data" button that generates a combined bundle with controller-labelled sections. Leaning: separate buttons per D-POPIA-14 — legal clarity trumps click count. Revisit if user research shows subjects confused by the separation.

---

*End of BUILD_65_POPIA_CUSTOMER_SURFACE.md*

*Authored 2026-04-20 · Cape Town · Claude Opus 4.7*
