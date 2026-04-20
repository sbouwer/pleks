# POPIA Processing-Purpose Register

> **Document type:** POPIA s17 accountability register · POPIA s18 notification schedule
> **Scope:** Pleks (operated by Yoros / Bouwer Property Group) and every third party Pleks uses
> **Version:** 2026.1 · **Effective from:** 2026-05-01 · **Supersedes:** none (initial publication)
> **Canonical source:** `brief/legal/PROCESSING_PURPOSES.md` in the Pleks repository (version controlled)
> **Public render:** https://app.pleks.co.za/privacy/processing-purposes
> **Related:** `/privacy` (privacy notice), BUILD_65 specification

---

## Read this first — agency-framing disclaimer

This document describes the processing activities carried out by **Pleks** (the platform) and by the third parties Pleks uses to deliver the service. It is published publicly because Pleks believes public accountability is stronger than private accountability, and because property-management agencies evaluating Pleks during procurement have a legitimate need to review exactly what the platform does with personal information before they commit.

**If you are an agency, landlord, or property practitioner using Pleks to manage rental properties, the following applies to you personally:**

Under POPIA you are the **Responsible Party** for every natural person whose personal information you collect — tenants, applicants, landlords, contractors, references, emergency contacts, household members, and anyone else whose details you enter into the platform or that the platform collects at your request. Pleks is your **Operator** — a processor acting on your behalf under the Pleks Operator Agreement. The distinction is legally load-bearing:

- The Responsible Party is **accountable** for the processing (POPIA s8). The Operator is not.
- The Responsible Party must maintain its own processing-purpose register. This document is not that register for you. It describes what Pleks does; your register must describe what your agency does, with Pleks listed as one of your Operators.
- The Responsible Party is the primary recipient of data-subject requests under POPIA s23–s25. Pleks supports the Responsible Party in responding within the 30-day statutory window (s19(2)(c)) but does not respond in the Responsible Party's place.
- The Information Regulator's complaint procedure under POPIA Chapter 10 runs against the Responsible Party. Pleks cannot stand between a data subject and the Regulator on an agency's behalf.

**What this document does for an agency adopting Pleks:** it gives you an accurate, structured description of Pleks's role as your Operator, which you can incorporate into your own processing-purpose register with confidence. Most of the work of describing Pleks-mediated processing is already done; you add your agency's context (who your data subjects are, what your lawful bases are for collecting their information in the first place, your own retention decisions where agency-specific, and which other Operators you use outside Pleks).

**If you are a data subject** (tenant, applicant, landlord, supplier, reference, household member), this document tells you what the platform does and who the actors are. Your rights under POPIA are exercised against the Responsible Party for your data — Pleks itself for your platform account; your agency for agency-operated data. The data-subject dashboard at `/tenant/privacy`, `/landlord/privacy`, or `/supplier/privacy` gives you one place to see every controller that holds data about you and to exercise your rights against each.

---

## Controllers

Pleks's processing activities fall into two distinct controller relationships, and the distinction is preserved everywhere in this register:

### Pleks as Responsible Party

For data arising from the platform itself — authentication, security telemetry, error monitoring, product feedback, uptime probes, internal cost observability, Pleks-level billing, marketing and waitlist management, support communications. Pleks is the sole decision-maker about whether and how to process this data, and Pleks is accountable under POPIA for it.

Purposes in this category are prefixed **A** (A1, A2, …) in this register.

### Pleks as Operator

For data arising from agency use of the platform — tenant profiles, leases, inspections, maintenance, communications, trust transactions, deposits, applications, credit checks, owner statements, and every other artefact of property management. The agency (a property practitioner holding a current PPRA Fidelity Fund Certificate in South Africa, or a landlord operating self-managed properties) is the Responsible Party; Pleks processes this data on the agency's behalf, under the agency's lawful bases, under the Pleks Operator Agreement — which incorporates the mandatory written-contract terms required by POPIA s20 (Operator authorisation and confidentiality obligations) and s21 (written contract governing the processing, including the subject-matter and duration of processing, nature and purpose, type of personal information, categories of data subjects, obligations and rights of the Responsible Party, and security measures).

Purposes in this category are prefixed **B** (B1, B2, …) in this register.

### The neutral sovereign posture

Pleks has deliberately declined custodial authority in two structurally symmetric ways:

- **Client money** stays with the agency in their own Section 86 trust account at their own bank, under their own PPRA Fidelity Fund Certificate. Pleks does not hold client funds, does not initiate payments, and is not the trustee. This invariant is documented at `brief/legal/TRUST_ACCOUNT_POSITIONING.md` and enforced at four layers (schema, code, ESLint, UI) per BUILD_64.
- **Client data** stays with the agency's legal responsibility under POPIA. Pleks is the Operator, not the Responsible Party, for agency-operated data. This invariant is enforced by the controller-role discipline in the schema (`popia_exports.controller_role`, `data_subject_requests.org_id`), the separation of subject-side and agency-side code paths in `lib/popia/*`, and the platform-admin routing-only inbox at `/admin/popia-requests`.

These are twin moats. The Operator-Responsible-Party split in this register is the POPIA expression of the "Pleks is not the trustee" doctrine.

---

## Information Officer

### Pleks (for Pleks-RP purposes — Part A)

- **Information Officer:** [Information Officer — to be confirmed before first paying agency customer] · Bouwer Property Group (trading as Pleks)
- **Email:** privacy@pleks.co.za
- **Postal address:** [to be confirmed]
- **POPIA registration number:** [pending — IR registration for private Responsible Parties is optional but common; will be confirmed before first paying customer]

### Agency (for Operator purposes — Part B)

Each agency using Pleks is the Responsible Party for the data processed under Part B. The Information Officer for Part B purposes is the agency's own — not Pleks's. Agencies are prompted to set their Information Officer details in-platform at `/settings/privacy/information-officer`; those details flow into privacy-policy pages, data-subject-request resolution emails, and rejection notices that carry the IR escalation path.

---

## Information Regulator of South Africa

The Regulator's contact details are surfaced alongside every rights-exercise surface and every rejection notice. Every data subject has the unconditional right to complain to the Regulator independently of Pleks or the agency's response.

- **Information Regulator of South Africa**
- JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
- complaints.IR@justice.gov.za
- +27 10 023 5207
- https://inforegulator.org.za

---

## How to maintain this register

This register is maintained as a living document. Every new processing purpose introduced by a subsequent Pleks build specification (BUILD_66, BUILD_67, and any ADDENDUM that adds processing) appends a new row to this register in the same structured format. The version number (`2026.1` at initial publication) increments on every material change, and material changes also insert a row in the **Change log** below.

Authoring discipline:

1. Every new AI purpose added to `lib/ai/client.ts` `AiPurpose` enum requires a corresponding purpose entry here (Part A if Pleks-RP, Part B if Operator).
2. Every new third-party Operator contracted by Pleks requires an entry in **Appendix A — Recipients & Operators directory** and a line in the recipient field of every purpose that uses them.
3. Every cross-border transfer requires a line in **Appendix B — Cross-border transfer schedule** with the POPIA s72 basis named.
4. Every purpose that touches POPIA s26 special personal information requires a line in **Appendix C — Special personal information map** and a DPIA flag per **Appendix D — DPIA framework**.
5. The public render at `/privacy/processing-purposes` rebuilds on every main-branch merge; the canonical markdown is always in sync with what is publicly visible.

Non-material changes (typo fixes, formatting, clarifications that don't alter processing substance) increment the patch component of the version number (`2026.1.1`) and are noted in the change log without triggering the material-change re-consent flow. Material changes (new purpose, new Operator, new cross-border transfer, retention period change, lawful basis change, new data category, new recipient) increment the version number to `2026.2` (or equivalent) and trigger the re-consent notification flow per BUILD_65 §5.

---

## Change log

| Version | Date | Change | Material? |
|---------|------|--------|-----------|
| 2026.1 | 2026-05-01 | Initial publication of the register. Covers 12 Pleks-RP purposes and 25 Pleks-Operator purposes established through BUILD_00–BUILD_65. | Initial — no re-consent flow triggered |
| 2026.1 (pre-launch revision) | 2026-04-20 | Pre-launch architectural review. Added Purpose B24 (FICA / KYC documentation storage for Accountable Institutions) to make explicit the Operator role in storing CDD documents that agencies already capture via BUILD_02 and BUILD_03 flows. Added Purpose B25 (agency-originated direct marketing to tenants — reserved placeholder) to document that this processing is architecturally possible but not currently deployed. Added explicit POPIA s20 + s21 reference to the Pleks Operator Agreement mention in the Controllers section. | Non-material — no new processing commences; B24 documents existing data capture more explicitly, B25 is a reserved placeholder. Register not yet in effect (effective_from 2026-05-01). No re-consent flow needed. |

---

# Part A — Pleks as Responsible Party

These are the purposes for which Pleks itself is the Responsible Party. The lawful basis for each is normally either performance of the contract between Pleks and the platform user (the Terms of Service, POPIA s11(1)(b)) or Pleks's legitimate interest in operating a reliable and secure service (POPIA s11(1)(f)), with appropriate balancing against the data subject's interests.

## Purpose A1 — Platform authentication

- **Purpose name (internal):** `platform_authentication`
- **Description:** Allow users (agents, tenants, landlords, suppliers, applicants) to sign in to the Pleks platform and maintain an authenticated session. Covers email + password authentication, magic-link authentication for tenants/landlords/suppliers, session cookie issuance, session expiry, and logout.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract (Pleks Terms of Service)
- **Personal data categories:** email address, password hash (bcrypt via Supabase Auth), session tokens, IP address, user agent, authentication event timestamps
- **Data subject categories:** every natural person who creates a Pleks account — agency staff, tenants, landlords, suppliers, applicants, platform administrators
- **Recipients / Operators:** Supabase (auth backend + database — see Appendix A), Resend (delivery of authentication-related emails such as magic links and new-device notifications)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) standard contractual clauses in the Pleks ↔ Operator DPA with each vendor.
- **Retention:** session records deleted 30 days after expiry; `auth_events` retained 7 years for security and Tribunal evidentiary purposes; account deletion purges authentication records 30 days after account closure except those legally required to be retained
- **DPIA required:** No — standard authentication processing
- **Related specifications:** BUILD_01 (auth, organisations, onboarding), BUILD_62 (authentication security — password policy, session tuning, new-device notification emails)
- **Notes:** Password complexity is enforced at 10 characters minimum with HaveIBeenPwned check per BUILD_62 Part A. The platform supports magic-link authentication for tenant/landlord/supplier roles and password authentication for agent roles; a central `/login` gateway routes based on identity.

## Purpose A2 — Multi-factor authentication (TOTP and passkeys)

- **Purpose name (internal):** `mfa_totp_passkeys`
- **Description:** Enforce multi-factor authentication for agent accounts (mandatory) and offer optional MFA for tenant/landlord/supplier accounts. Includes TOTP enrolment via authenticator app, passkey (WebAuthn) enrolment and authentication, step-up challenges for fiduciary-class actions, and MFA-fresh tracking for recently-authenticated sessions.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract (Pleks Terms of Service) + s11(1)(d) obligation imposed by law (POPIA s19 security safeguards); for agents, also Pleks's s11(1)(f) legitimate interest in preventing unauthorised access to fiduciary-class operations
- **Personal data categories:** TOTP secret (encrypted at rest), passkey credential ID, passkey public key, credential counter, authenticator AAGUID, device name (user-provided label), enrolment and authentication event timestamps, IP address at enrolment
- **Data subject categories:** every natural person who enrols in MFA on their Pleks account; mandatory for agent roles, optional for tenant/landlord/supplier
- **Recipients / Operators:** Supabase (storage of MFA records), SimpleWebAuthn (passkey verification library, executed in-process — not a network Operator), Resend (delivery of MFA enrolment and unenrolment notifications)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs.
- **Retention:** 7 years alongside `auth_events`; revoked passkey records soft-deleted and purged after 30 days
- **DPIA required:** No — MFA processing is a POPIA s19 safeguard, not a processing activity that creates new risk
- **Related specifications:** BUILD_62 (authentication security — Parts A and B cover TOTP and passkeys respectively)
- **Notes:** Passkey credentials are stored per RFC 8152 (COSE) encoding; the private key never leaves the authenticator device. Pleks cannot recover a lost passkey; recovery pathways are TOTP fallback (agents) or admin-mediated reset (`supabase.auth.admin`).

## Purpose A3 — Error monitoring and exception tracking

- **Purpose name (internal):** `error_monitoring`
- **Description:** Capture unhandled exceptions, server-side errors, and client-side errors to detect and fix defects. Every event routed through a POPIA-safe scrubber (`lib/observability/scrubbing.ts`) that removes request bodies from sensitive routes (auth, passkey, payment, application, webhook, cron, POPIA-adjacent), redacts known PII field names at any nesting depth, and strips free-text PII patterns (SA ID numbers, bank accounts, email addresses, credit card numbers) from every event before transmission.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(f) legitimate interest (detection and remediation of platform defects is necessary for a reliable service and the balance of interests favours processing; data subjects benefit from a functioning platform)
- **Personal data categories:** user ID (UUID), organisation ID (UUID), role (agent/tenant/landlord/supplier), release version, error type, stack trace, (possibly) route path with query parameters stripped. **No** email, name, phone, IP address, browser fingerprint, request body, response body, session cookie, or local variable values.
- **Data subject categories:** any Pleks user whose browser or server session triggers an exception
- **Recipients / Operators:** Sentry (US-based error-monitoring SaaS — see Appendix A)
- **Cross-border transfer:** Yes — Sentry is US-based. Basis: s72(1)(b) SCCs via Sentry DPA + POPIA-safe scrubber removing PII at source
- **Retention:** 90 days at Sentry (Sentry's default); Pleks does not retain error events independently
- **DPIA required:** No — aggressive PII scrubbing reduces risk below DPIA threshold
- **Related specifications:** ADDENDUM_00E (error monitoring with POPIA scrubber); BUILD_65 adds POPIA-adjacent routes to the scrubber denylist
- **Notes:** Users can opt out of error monitoring at `/settings/privacy`. Opt-out is respected both client-side (SDK disabled) and server-side (scrubber returns null for events attributed to opted-out user IDs, with a 5-minute in-memory cache). Session Replay is deliberately not deployed (would add PII exposure risk; deferred to Tier 2 with strict masking if ever enabled).

## Purpose A4 — In-product user feedback

- **Purpose name (internal):** `user_feedback`
- **Description:** Capture free-text feedback, bug reports, feature requests, and general comments from platform users via a floating feedback button on every authenticated layout. Support reply-by-email via Resend. Used to prioritise product development and respond to individual users.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(a) consent (the user explicitly initiates feedback submission) + s11(1)(b) performance of contract (responding to user queries is implicit in the Terms of Service)
- **Personal data categories:** user ID, organisation ID, active role, feedback category, free-text submission body (may contain arbitrary PII the user chooses to include), submission URL with query parameters stripped, viewport, user agent, release version, reply thread (if any)
- **Data subject categories:** Pleks platform users who submit feedback
- **Recipients / Operators:** Supabase (storage), Resend (reply delivery)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs.
- **Retention:** indefinite for non-deleted submissions (product development memory); soft-deletion on user account closure replaces user_id with NULL but retains the content for pattern recognition; submitter's free-text body redacted to "[deleted by user]" on explicit deletion request
- **DPIA required:** No — voluntary submission by the user with the user as the source of the PII; scrubber-exempt (free-text field may genuinely contain PII; protection is via RLS and access restriction rather than scrubbing)
- **Related specifications:** ADDENDUM_00F (in-app feedback with org-admin + platform-admin routing)
- **Notes:** `/api/feedback` is on the Sentry scrubber denylist (per ADDENDUM_00E integration in ADDENDUM_00F) — feedback free-text may contain PII and must not leak to error monitoring.

## Purpose A5 — Uptime monitoring and health probes

- **Purpose name (internal):** `uptime_monitoring`
- **Description:** External probes of the `/api/health` endpoint (shallow, public, no DB touch) and `/api/health/deep` (token-authenticated, component-level breakdown) to detect platform outages. Heartbeat monitoring on four critical daily crons. Public status page at `pleks.co.za/status` reflecting current component health and 30-day uptime history.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(f) legitimate interest (platform availability monitoring is necessary for service reliability; data subjects benefit directly)
- **Personal data categories:** none in direct probe traffic; probe bodies contain only component health status text, no user-identifying information
- **Data subject categories:** none (probes are system-to-system)
- **Recipients / Operators:** Better Stack (uptime monitoring SaaS — see Appendix A), Slack (alert delivery)
- **Cross-border transfer:** Yes — Better Stack is US-based, Slack is US-based. Basis: s72(1)(b) SCCs + the fact that no personal information is transmitted in probe traffic.
- **Retention:** 30 days rolling at Better Stack; public status page retains 30 days of component-level uptime data
- **DPIA required:** No — no personal information processed
- **Related specifications:** ADDENDUM_00G (uptime monitoring via Better Stack + public status page)

## Purpose A6 — Cost and usage observability

- **Purpose name (internal):** `cost_usage_observability`
- **Description:** Track per-organisation resource consumption (emails sent via Resend, WhatsApp and SMS via Africa's Talking, AI calls via Anthropic, Vercel function invocations, Supabase compute allocation) for three reasons: platform-level unit economics (Pleks understanding the cost of serving each customer), customer-facing usage counters shown at `/settings/subscription` (Steward+ tiers), billing for overage when relevant.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract (Pleks Terms of Service include subscription and usage tracking) + s11(1)(f) legitimate interest (understanding platform economics is necessary for pricing and sustainability)
- **Personal data categories:** organisation ID, purpose of AI call (e.g., `maintenance_triage`), model, token counts, cost in cents, latency, success/error code, last-user-login-at (per `auth_events`), invocation counts. **No** prompt text, **no** response text, **no** PII in metadata — only structured purpose-specific context.
- **Data subject categories:** none directly; data is aggregated at the organisation level. Individual users are not identified in cost records.
- **Recipients / Operators:** Supabase (storage), Vercel (function invocation counts via management API when `VERCEL_API_TOKEN` configured), Anthropic (AI call cost attribution — downstream of Purpose B22)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs.
- **Retention:** `ai_usage` rows 2 years; `platform_cost_snapshots` 36 months; `messaging_usage` and `subscription_charges` 5 years (tax record retention)
- **DPIA required:** No — aggregate processing without PII
- **Related specifications:** ADDENDUM_00H (cost/usage dashboards, `lib/ai/client.ts` wrapper as choke point)

## Purpose A7 — Marketing waitlist

- **Purpose name (internal):** `marketing_waitlist`
- **Description:** Capture email addresses of prospective customers (agents, landlords, property managers) via the `/early-access` waitlist page. Send a confirmation email and, when early access is opened, a launch notification. Marketing-list management is explicitly opt-in per POPIA s69 direct-marketing rules.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(a) consent (the user explicitly submits the waitlist form)
- **Personal data categories:** email address, self-declared role (Agent / Landlord / Property Manager), consent timestamp, IP address, user agent
- **Data subject categories:** prospective Pleks customers
- **Recipients / Operators:** Supabase (storage in `waitlist` table), Resend (confirmation and launch emails)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(a) consent (subject opts into the waitlist with full knowledge of the marketing purpose).
- **Retention:** until account creation (waitlist entry linked to user via matching email), or 12 months from submission if no account created, whichever comes first
- **DPIA required:** No — voluntary opt-in to a named marketing purpose
- **Related specifications:** BUILD_01 (waitlist table in `001_foundation.sql`), CLAUDE.md Task 4 (opt-in landing page)
- **Notes:** Unsubscribe is one-click via every marketing email per POPIA s69(2) and CPA s32; Resend handles unsubscribe link insertion and honours suppression list.

## Purpose A8 — Platform-level billing and subscriptions

- **Purpose name (internal):** `platform_billing`
- **Description:** Manage Pleks's own subscription billing to agencies. Tier selection (Owner Free, Steward, Portfolio, Firm, Enterprise), Owner Pro per-lease premium charges, overage billing for usage above tier quotas, invoicing, payment processing.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract (Pleks Terms of Service) + s11(1)(c) compliance with law (Tax Administration Act, Value-Added Tax Act)
- **Personal data categories:** organisation billing contact name, email, phone, billing address, VAT number, invoice history, charge history, tier and feature selection, subscription state
- **Data subject categories:** organisation billing contacts (typically the agency principal or accounts administrator)
- **Recipients / Operators:** Supabase (storage), Resend (invoice email delivery), PayFast (payment processing for initial Owner Pro charges; broader billing rail TBD), Anthropic (if AI is used for invoice generation — not currently)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs and s72(2) necessity for performance of contract.
- **Retention:** 5 years from the date of the most recent charge (Tax Administration Act s29)
- **DPIA required:** No — standard commercial billing
- **Related specifications:** ADDENDUM_57F (Owner Pro per-lease billing), BUILD_00_PAYFAST_ARCHITECTURE

## Purpose A9 — Support communications

- **Purpose name (internal):** `support_communications`
- **Description:** Inbound email to support@pleks.co.za from users or non-users requesting assistance. Outbound responses from Pleks support. Includes POPIA data-subject requests that reach Pleks directly (routed to the correct Responsible Party via `/admin/popia-requests`; see Purpose A12).
- **Controller:** Pleks (Responsible Party) for the support-communication artefact itself; note that a support request *about* agency-operated data is distinct from the agency data itself (which remains under agency Operator relationship per Part B)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract (support is implicit in the Terms of Service) + s11(1)(f) legitimate interest
- **Personal data categories:** email address, name, message body (may contain arbitrary PII), attachment filenames and content, correspondence thread
- **Data subject categories:** any natural person who writes to Pleks support, whether a Pleks user or not
- **Recipients / Operators:** the email provider handling the `support@pleks.co.za` inbox (currently Resend's inbound handling where enabled; fallback: Google Workspace if configured — see Appendix A for current provider state), Supabase (storage if archived in-platform)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** 3 years from the date of the most recent correspondence in the thread, or until the subject requests deletion, or indefinitely for threads that are part of an ongoing legal matter
- **DPIA required:** No
- **Related specifications:** none direct; data-subject-request routing is covered in BUILD_65 Purpose B23

## Purpose A10 — Audit logging

- **Purpose name (internal):** `audit_log`
- **Description:** The `audit_log` table records every state-changing operation in Pleks — creation, update, deletion, and approval of records across the platform. Each row captures the actor (user), the target (entity type and ID), the event type, timestamp, IP address, and a payload of the change. This is a Pleks-RP artefact (Pleks is the Responsible Party for the log itself as a security and accountability record), but the log *describes* agency-operated operations in many cases.
- **Controller:** Pleks (Responsible Party for the log artefact) — note the dual nature: log entries describing Part B processing are part of the agency's evidence chain for their own accountability, but the audit log as a continuous record is Pleks's own accountability artefact under POPIA s17
- **Lawful basis (POPIA s11):** s11(1)(c) compliance with law (POPIA s17 accountability principle; Electronic Communications and Transactions Act record requirements) + s11(1)(f) legitimate interest (security monitoring and fraud prevention)
- **Personal data categories:** actor user ID, actor IP address, target entity identifiers (may include tenant ID, landlord ID, lease ID, etc.), event type, before-and-after values of changed fields (may incidentally include PII), timestamp
- **Data subject categories:** the actor who performed the operation; indirectly, any data subject whose record was modified
- **Recipients / Operators:** Supabase (storage)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs.
- **Retention:** 7 years (aligns with standard SA business records retention and PPRA audit timelines); `auth_events` retention matches
- **DPIA required:** No — regulatory-mandated accountability record
- **Related specifications:** BUILD_00 (foundational audit_log table), BUILD_62 (auth_events companion table), every build that writes audit entries
- **Notes:** Audit logs are immutable (no UPDATE or DELETE policies); subject-initiated erasure never removes audit_log rows, though a record of the erasure itself is added as a new audit entry per BUILD_65 §5.4.

## Purpose A11 — In-product analytics

- **Purpose name (internal):** `product_analytics`
- **Description:** Understand how platform users navigate the product, which features they use, and where they encounter friction. **Currently not deployed** — Pleks does not run a dedicated product-analytics tool (no Mixpanel, no Amplitude, no Segment, no Google Analytics on authenticated routes). Page-visit patterns are inferable only from Vercel function invocation logs (aggregated, non-identifying) and from `auth_events` session data (for security, not product analytics).
- **Controller:** Pleks (Responsible Party) — placeholder for the future case
- **Lawful basis (POPIA s11):** s11(1)(f) legitimate interest — would apply if deployed, with balancing test documented; s11(1)(a) consent is not currently the chosen basis because a tool has not been selected
- **Personal data categories:** currently none
- **Data subject categories:** currently none
- **Recipients / Operators:** currently none
- **Cross-border transfer:** currently none
- **Retention:** not applicable
- **DPIA required:** Yes — whenever a product-analytics tool is chosen, a DPIA is triggered because analytics processing is novel to Pleks and has privacy implications that should be assessed before deployment
- **Related specifications:** none currently; a future ADDENDUM will add the purpose if deployed
- **Notes:** This entry is recorded here so that the absence of analytics is explicit rather than implicit. Agencies evaluating Pleks can confirm from this register that their users are not tracked by a third-party analytics vendor.

## Purpose A12 — Platform administration and customer-success observability

- **Purpose name (internal):** `platform_administration`
- **Description:** Cross-agency operational observability for Pleks platform administrators (a small set of Yoros / Bouwer Property Group staff flagged via `organisations.settings->>'platform_admin'='true'`). Covers the `/admin/platform-health` dashboard (revenue vs cost, cost outliers, inactive-org flags), `/admin/trust-health` (overdue trust closes, FFC expiry), `/admin/popia-requests` (routing inbox for subject requests that reach Pleks directly), `/admin/feedback` (global feedback inbox). Purpose is customer success, not custodial control — Pleks actions its own platform data here and routes agency-data matters to the correct Responsible Party.
- **Controller:** Pleks (Responsible Party)
- **Lawful basis (POPIA s11):** s11(1)(f) legitimate interest (understanding platform health is necessary to serve customers reliably; the balancing test favours processing because agency data is never exposed in aggregated form — only operational signals like "this agency has not closed trust for 11 days")
- **Personal data categories:** organisation ID, organisation name, agency FFC number and expiry, last-user-login timestamp, aggregated activity signals (cron invocation counts, active lease count), cost attribution (downstream of Purpose A6)
- **Data subject categories:** agencies (juristic persons — limited POPIA applicability) and agency principals (named contacts on the organisation record — natural persons, POPIA-covered)
- **Recipients / Operators:** Supabase (storage), Resend (customer-success outreach emails when a platform admin clicks "Reach out" on an overdue agency)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs.
- **Retention:** operational signals retained indefinitely while the organisation is active; account closure purges platform-admin observability records after the retention window for billing records expires (5 years — tax record retention controls)
- **DPIA required:** No — no cross-agency aggregate custodial view exists; per-agency drill-down reads via service role are the same data the agency itself has access to in its own workspace
- **Related specifications:** ADDENDUM_00H (cost dashboards), BUILD_64 (trust-health), BUILD_65 (popia-requests routing), ADDENDUM_00F (feedback)

---

# Part B — Pleks as Operator

These are the purposes for which an agency using Pleks is the Responsible Party and Pleks is the Operator. Every purpose here is processed on behalf of the agency, under the lawful basis the agency holds for the processing, under the terms of the Pleks Operator Agreement (the instrument documenting the Operator-Responsible Party relationship between Pleks and each customer agency).

Each purpose in Part B describes what Pleks does on behalf of the agency. **The lawful basis shown is the agency's lawful basis for the underlying processing, which Pleks processes under as Operator.** The agency must confirm its lawful basis for each purpose in its own register.

## Purpose B1 — Property portfolio management

- **Purpose name (internal):** `property_portfolio`
- **Description:** Record and maintain the agency's property portfolio — properties, buildings, units, managing schemes, insurance, brokers, furnishings, inspection profiles, unit types, clause profiles. Supports the agency's core property-management function.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (mandate agreement between agency and landlord) + s11(1)(f) legitimate interest (portfolio management is necessary for the agency's core business)
- **Personal data categories:** property address (indirectly identifying when combined with landlord name), landlord relationship, broker identity, managing scheme contact details, insurance broker and policy contact, emergency contact for the property
- **Data subject categories:** landlords, brokers, managing scheme contacts, emergency contacts named on property records
- **Recipients / Operators:** Supabase (storage), Anthropic (AI-assisted property setup when used — see Purpose B22)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** for the duration of the agency's mandate on the property; after mandate ends, per the agency's own retention policy (default 5 years post-termination matching lease document retention per D-POPIA-02)
- **DPIA required:** No — standard property-management processing
- **Related specifications:** BUILD_02 (properties & units), BUILD_37 (properties redesign), BUILD_59 (insurance, broker, managing scheme), BUILD_60 (smart property setup), ADDENDUM_02A (buildings layer), ADDENDUM_02B (residential/commercial)

## Purpose B2 — Landlord CRM and relationship management

- **Purpose name (internal):** `landlord_crm`
- **Description:** Maintain landlord profiles, contact details, bank details for statement payouts, relationship history, and communication preferences. Supports owner statements, communications, and the landlord portal.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (mandate agreement with landlord) + s11(1)(c) compliance with law (PPRA disclosure obligations, tax record obligations for disbursements)
- **Personal data categories:** name, ID number, date of birth, contact phone, contact email, residential and postal addresses, bank account details (masked at rest, encrypted for operational needs), marital status where relevant, spousal consent records for specific juristic acts
- **Data subject categories:** landlords (natural persons); juristic landlords (POPIA applies only to natural-person directors/contacts of juristic landlords)
- **Recipients / Operators:** Supabase (storage), Resend (landlord communications), Africa's Talking (SMS and WhatsApp to landlord contacts)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** for the duration of the mandate + 5 years post-termination (PPRA trust record retention + general prescription act retention)
- **DPIA required:** No
- **Related specifications:** BUILD_25 (contacts module), BUILD_27 (two-level agent model), BUILD_46 (landlord portal)

## Purpose B3 — Tenant application processing

- **Purpose name (internal):** `tenant_application`
- **Description:** Accept rental applications from prospective tenants via the public `/apply/[slug]` portal. Capture application form data, supporting documents (ID, proof of income, bank statements, employer letter), and consent records. Support the agency's shortlist-and-screen workflow.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(a) consent (applicant submits the form and consents to processing for purposes of the specific application) + s11(1)(b) pre-contractual steps taken at the data subject's request (POPIA s11(1)(b) includes pre-contract processing)
- **Personal data categories:** full name, ID number, date of birth, contact phone, contact email, employment details, employer contact details, salary, dependent / household member details, previous rental history and landlord references, supporting documents
- **Data subject categories:** primary applicant; co-applicants on joint applications; household members declared in the application; references named by the applicant; applicant's employer contact named
- **Recipients / Operators:** Supabase (storage), PayFast (application fee payment processing), Searchworx (credit check — see Purpose B4), Anthropic (income extraction from bank statements — see Purpose B22), DocuSeal (document signing when the application becomes a lease — see Purpose B6)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** rejected applications 12 months from rejection (POPIA minimisation); approved applications absorbed into the lease retention window (5 years post-termination)
- **DPIA required:** No — routine rental application processing, with clear consent at the point of data collection
- **Related specifications:** BUILD_16 (application pipeline), BUILD_48 (applicant portal), ADDENDUM_16A (joint application), ADDENDUM_16B (motivation field), ADDENDUM_03A (foreign nationals)
- **Notes:** The applicant pays the application fee (R399 single, R749 joint) via PayFast directly — the agency never pays for a credit check. The applicant's consent to the credit check is captured explicitly before the check is initiated (see Purpose B4).

## Purpose B4 — Credit checking (Searchworx)

- **Purpose name (internal):** `credit_check_searchworx`
- **Description:** Obtain a credit bureau report on an applicant for the purpose of assessing tenancy suitability. Searchworx acts as the aggregator; the underlying credit bureau (TransUnion, Experian, Compuscan, XDS depending on the product) is the source of truth. Pleks stores the result of the check, not the raw bureau data beyond what Searchworx returns.
- **Controller:** Agency (Responsible Party); Pleks (Operator); Searchworx (sub-Operator to the agency)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(a) **explicit consent** (the applicant consents to the specific purpose of a credit check before it is run; consent may be withdrawn, but withdrawal does not unwind a credit check that has already been performed — it only prevents future checks)
- **Personal data categories:** applicant ID number (required by the bureau), full name, date of birth, residential addresses (current and historical), employment history, credit history, default records, civil judgments, credit score, affordability calculation result
- **Data subject categories:** rental applicants only (credit checks are not run on anyone else)
- **Recipients / Operators:** Searchworx (credit bureau aggregator — see Appendix A), underlying credit bureaus via Searchworx (TransUnion, Experian, Compuscan, XDS), Supabase (storage of Pleks's cache of the result), Anthropic (FitScore generation — see Purpose B5 and Purpose B22)
- **Cross-border transfer:** No for the credit check itself (Searchworx and the SA credit bureaus operate domestically). Yes for derivative AI processing — see Purpose B22.
- **Retention:** 12 months from the pull date OR lease termination date, whichever is later. SA credit reports are only valid for 3 months by credit-industry practice, but Pleks retains the result for 12 months to give agents a defensible "last view" when deciding whether to re-pull for a repeat applicant. After retention, the record is deleted; the fact that a check was run is retained in the consent log and the application record (not the bureau result itself).
- **DPIA required:** **Yes** — credit checking processes POPIA-sensitive information at a meaningful scale and is the single most regulatory-attention-drawing processing activity in the platform. DPIA is documented at [internal DPIA register — to be completed before first paying customer].
- **Related specifications:** BUILD_14 (Searchworx + FitScore), ADDENDUM_44A (credit terms), BUILD_16 (application pipeline coupling)
- **Notes:** POPIA s11(1)(a) consent is captured with a dedicated consent screen before the credit check is initiated; the consent text identifies Searchworx by name, the bureau behind Searchworx, the specific purpose, the retention period, and the subject's right to withdraw consent for future checks. The consent log entry is immutable.

## Purpose B5 — FitScore generation and applicant comparison

- **Purpose name (internal):** `fitscore`
- **Description:** Generate a numeric affordability-and-suitability score for a rental applicant by combining credit check results (Purpose B4), declared income (verified against bank statements via Purpose B22 income extraction), rental history (references), and employment stability. Displayed to the agent alongside a human-readable rationale. Every applicant's FitScore is shown to the agent regardless of result (no "hidden" rejections — see note below).
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** follows from Purpose B4 (s11(1)(a) consent — the applicant consented to the credit check knowing the results would be used to assess suitability)
- **Personal data categories:** derivative of Purpose B4 + declared income, verified income, rental history, employment information
- **Data subject categories:** rental applicants
- **Recipients / Operators:** Anthropic (Claude Sonnet generates the FitScore rationale narrative via `lib/ai/client.ts` with purpose `fitscore_summary`), Supabase (storage)
- **Cross-border transfer:** Yes — Anthropic processing is US-based (see Appendix B). Basis: s72(1)(b) SCCs and s72(1)(a) consent (applicant consented to the processing purpose at Purpose B4 which includes derivative FitScore generation as disclosed).
- **Retention:** follows Purpose B4 (12 months or lease termination, whichever later)
- **DPIA required:** Yes — automated decision-making adjacent processing; POPIA s71 (automated processing) prohibits automated decisions that have legal or similarly significant effect without human intervention. FitScore is explicitly designed to support, not replace, human agent judgment; this is documented in the DPIA and in the UI (every applicant is shown to the agent regardless of score, preventing a hidden-bias discrimination claim).
- **Related specifications:** BUILD_14 (FitScore), ADDENDUM_00H (AI wrapper for cost attribution)
- **Notes:** The "show every applicant regardless of score" requirement is a non-negotiable in the system prompt and in the spec lineage — it is a legal protection against discrimination claims (Equality Act 4 of 2000, Rental Housing Act s4(1) prohibition on unfair discrimination) and a product decision.

## Purpose B6 — Lease generation, signing, and document management

- **Purpose name (internal):** `lease_generation_signing`
- **Description:** Generate a lease document from the agency's configured template + clause profile + unit-level overrides + lease-specific data; render to PDF; route through DocuSeal for digital signing; store signed lease PDF and store signatures. Supports lease creation, amendment, renewal, and termination document flows.
- **Controller:** Agency (Responsible Party); Pleks (Operator); DocuSeal (sub-Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (the lease itself is the contract) + s11(1)(c) compliance with law (Rental Housing Act s5 written lease requirements, CPA s14 auto-renewal notice requirements, Electronic Communications and Transactions Act signature requirements)
- **Personal data categories:** full names, ID numbers, dates of birth, contact details, employment details, signatures (drawn or uploaded), signatures of co-tenants and landlords
- **Data subject categories:** tenants, co-tenants, landlords, sureties if any, agents signing on behalf of agency, witnesses
- **Recipients / Operators:** Supabase Storage (signed lease PDF), DocuSeal (signing platform — see Appendix A), Resend (signing invitation emails), Anthropic (clause conflict checking and lease template drafting — Purpose B22)
- **Cross-border transfer:** Yes — see Appendix B. Basis: s72(1)(b) SCCs and s72(2) necessity for performance of the lease contract itself.
- **Retention:** 5 years post-termination (Prescription Act + PPRA mandate practice)
- **DPIA required:** No — lease generation is the core agency activity
- **Related specifications:** BUILD_04 (leases), BUILD_32 (lease template UX), BUILD_33 (lease activation), BUILD_34 (lease doc formatting), ADDENDUM_31A / 31B (clause UX and conflicts), ADDENDUM_33A (flexible signing)

## Purpose B7 — Lease lifecycle management

- **Purpose name (internal):** `lease_lifecycle`
- **Description:** Manage the lease over its full lifecycle — activation (gating on prerequisites), escalation application at anniversaries, CPA s14 auto-renewal notice (20 business days before expiry), notice acknowledgement, amendment (with audit trail), termination, move-out, deposit reconciliation, final communications. Integrates with most other Part B purposes.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (RHA and CPA specific notice obligations)
- **Personal data categories:** tenant contact details, lease state, notice history
- **Data subject categories:** tenants, co-tenants, landlords
- **Recipients / Operators:** Supabase (storage), Resend / Africa's Talking (notice delivery)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** follows Purpose B6 (5 years post-termination)
- **DPIA required:** No
- **Related specifications:** BUILD_12 (lease lifecycle), BUILD_33 (lease activation), ADDENDUM_04A (CPA applicability)

## Purpose B8 — Rent invoicing, collection, and DebiCheck mandates

- **Purpose name (internal):** `rent_debicheck_collection`
- **Description:** Generate monthly rent invoices for each active lease; issue to the tenant; for leases with an active DebiCheck mandate, initiate rent collection via Peach Payments against the mandate. DebiCheck is the single permitted inbound payment rail in Pleks; the mandate is authorised by the tenant at lease activation and collected funds flow directly into the agency's own trust account at the agency's own bank.
- **Controller:** Agency (Responsible Party); Pleks (Operator); Peach Payments (sub-Operator); the clearing bank (sub-Operator to Peach)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (the lease requires rent payment and specifies DebiCheck as the collection method when selected) + s11(1)(a) consent at DebiCheck mandate signing (DebiCheck's own consent capture is legally specific and narrower than POPIA consent)
- **Personal data categories:** tenant bank account details (encrypted at rest), rent amount, collection schedule, mandate ID, collection success/failure events
- **Data subject categories:** tenants (as payers); the mandate record is the tenant's commitment to the agency, intermediated by Peach
- **Recipients / Operators:** Peach Payments (DebiCheck mandate management), Supabase (storage)
- **Cross-border transfer:** Peach Payments is SA-domiciled — no cross-border transfer. Basis: domestic processing only.
- **Retention:** mandate record + collection history 5 years post-lease-termination (Tax Administration Act + PPRA)
- **DPIA required:** No — standard DebiCheck processing under the established mandate framework
- **Related specifications:** BUILD_10 (DebiCheck), BUILD_64 (sovereign trust — DebiCheck is the narrow inbound exception; outbound DebiCheck rejected)
- **Notes:** Pleks does not initiate outbound payments (owner payouts, supplier payments, refunds) via DebiCheck or any other rail. Outbound payments are the agency's to make at their own bank. This is the sovereign-trust invariant per BUILD_64 D-TRUST-01.

## Purpose B9 — Application fee processing (PayFast)

- **Purpose name (internal):** `payfast_application_fees`
- **Description:** Accept the R399 single or R749 joint rental application fee from the applicant directly via PayFast. The applicant pays; the agency does not. Pleks charges the applicant a platform fee, and the balance flows to the agency (or to Pleks depending on the tier contract).
- **Controller:** Pleks (Responsible Party — the transaction is between Pleks and the applicant, not between agency and applicant at the PayFast layer); agency is notified of the payment but does not originate it
- **Lawful basis (POPIA s11):** s11(1)(a) consent (the applicant initiates payment knowing the purpose) + s11(1)(b) performance of contract
- **Personal data categories:** applicant name, email, ID number (passed to PayFast), payment amount, transaction reference, card or EFT method indicator (not full card number — PayFast is the PCI boundary)
- **Data subject categories:** rental applicants
- **Recipients / Operators:** PayFast (payment processor — SA-domiciled)
- **Cross-border transfer:** No — PayFast is SA-domiciled. Basis: domestic processing.
- **Retention:** 5 years (Tax Administration Act)
- **DPIA required:** No — standard consumer payment processing; Pleks is on the PCI boundary on one side via PayFast (not a direct card-handler)
- **Related specifications:** BUILD_00_PAYFAST_ARCHITECTURE, BUILD_16 (application pipeline)

## Purpose B10 — Owner (landlord) statements

- **Purpose name (internal):** `owner_statements`
- **Description:** Generate monthly statements for each landlord showing rent collected, deductions (management fees, maintenance costs, municipal costs, deposit transactions), and net payable. Deliver via email or landlord portal.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (mandate agreement requires financial reporting) + s11(1)(c) compliance with law (PPRA statement-of-account requirements)
- **Personal data categories:** landlord name, contact details, property portfolio breakdown, financial transaction data
- **Data subject categories:** landlords
- **Recipients / Operators:** Supabase (storage), Resend (email delivery), Anthropic (welcome pack narrative when first statement is issued — Purpose B22)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** 5 years from statement date (Tax Administration Act)
- **DPIA required:** No
- **Related specifications:** BUILD_08 (owner statements), BUILD_46 (landlord portal), BUILD_53 (landlord welcome pack)

## Purpose B11 — Rent ledger, arrears, and letters of demand

- **Purpose name (internal):** `rent_ledger_arrears`
- **Description:** Maintain the rent ledger per lease, track arrears (open cases), escalate arrears through a graduated sequence (informal reminder → formal reminder → letter of demand → final notice before cancellation), record payment arrangements, resolve cases.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (formal demand requirements under common law and Rental Housing Act s4B) + s11(1)(f) legitimate interest (protecting the landlord's income)
- **Personal data categories:** tenant contact details, payment history, arrears amount, communications sent, arrears case state
- **Data subject categories:** tenants (primary); co-tenants jointly liable
- **Recipients / Operators:** Supabase (storage), Resend / Africa's Talking (communication delivery), Anthropic (LOD and final notice text generation — Purpose B22)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** 5 years post-termination (Prescription Act + PPRA + Tribunal evidentiary practice)
- **DPIA required:** No
- **Related specifications:** BUILD_11 (arrears), BUILD_63 (tenant communication lifecycle — wires formal letter delivery)

## Purpose B12 — Trust account reconciliation

- **Purpose name (internal):** `trust_reconciliation`
- **Description:** Monthly reconciliation of the agency's Section 86 trust account. Bank statement import (OFX/CSV/QIF via BUILD_50 Part A), matching, three-balance comparison, variance acknowledgement, sign-off. Produces an EAAB/PPRA-compliant audit export (PDF + XLSX) with SHA-256 manifest hash for tamper-evidence. Supports the agency's annual PPRA audit.
- **Controller:** Agency (Responsible Party); Pleks (Operator); the agency's bank (third party, not an Operator to Pleks — the agency's relationship with their bank is direct)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(c) compliance with law (Property Practitioners Act s54, Estate Agency Affairs Act s32 trust account requirements, PPRA audit requirements)
- **Personal data categories:** tenant and landlord names on trust transactions, transaction amounts, bank statement text (may contain tenant or landlord names in narrative), deposit and management fee records
- **Data subject categories:** every natural person whose money flows through the agency's trust account — tenants paying rent and deposit, landlords receiving disbursements
- **Recipients / Operators:** Supabase (storage), Anthropic (variance explanation narrative — Purpose B22, `trust_audit_narrative` purpose)
- **Cross-border transfer:** Yes for AI processing (see Appendix B); bank data import is a local file upload or future Yodlee feed.
- **Retention:** 5 years post-close (PPRA indefinite retention of audit records + Pleks policy of indefinite retention given storage cost is negligible relative to regulatory value)
- **DPIA required:** No — regulatory-mandated processing
- **Related specifications:** BUILD_64 (sovereign trust — full doctrine and invariant enforcement), BUILD_09 (bank reconciliation), BUILD_50 Part A (OFX/CSV/QIF import)
- **Notes:** Pleks never holds trust funds; the reconciliation describes the agency's own bank account activity. This is the sovereign-trust invariant.

## Purpose B13 — Deposit management

- **Purpose name (internal):** `deposit_management`
- **Description:** Record deposit receipts, accrue interest (per the lease's configured interest mode — prime-linked, fixed, repo-linked, or manual), generate interest statements, handle deposit deductions at move-out (wear-and-tear vs damage classification with per-item justification), issue itemised deduction schedule within 21 days per Rental Housing Act s5(7).
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (Rental Housing Act s5 deposit rules, PPRA trust account rules)
- **Personal data categories:** tenant name, deposit amount, interest accrued, deduction history with per-item details, photos of damage claimed, wear-and-tear assessments
- **Data subject categories:** tenants (as depositors)
- **Recipients / Operators:** Supabase (storage including photo storage), Resend (statement delivery), Anthropic (deposit deduction justification narrative — Purpose B22)
- **Cross-border transfer:** Yes for AI processing; storage and delivery mostly domestic.
- **Retention:** 5 years post-termination (PPRA trust record retention)
- **DPIA required:** No
- **Related specifications:** BUILD_17 (deposit reconciliation), ADDENDUM_17A (deposit interest modes), BUILD_12 (lease lifecycle — move-out flow)

## Purpose B14 — Inspection management

- **Purpose name (internal):** `inspection_management`
- **Description:** Schedule and conduct property inspections (move-in, periodic, move-out). Capture condition per room and per item. Preserve photo EXIF data (GPS and timestamp) for Tribunal evidentiary purposes. Support mobile inspection workflow. Generate inspection PDF with agent and tenant signatures. Classify wear-and-tear vs damage per item per BUILD_05 workflow.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (Rental Housing Act inspection requirements)
- **Personal data categories:** tenant name and signature, agent name and signature, property address (may identify the tenant by residence), photos of the property interior and exterior (may incidentally include tenant belongings or persons; EXIF GPS and timestamp preserved)
- **Data subject categories:** tenants; incidentally, any persons visible in inspection photos
- **Recipients / Operators:** Supabase Storage (photos and PDFs), Anthropic (wear-and-tear assessment via `inspection_assessment` purpose — Purpose B22)
- **Cross-border transfer:** Yes for AI processing.
- **Retention:** 3 years post-termination (Rental Housing Act evidentiary practice); 5 years if a Tribunal dispute arises within the retention window (Tribunal evidence retention)
- **DPIA required:** No — standard inspection processing; incidental PII in photos (persons, belongings) is a known property-management norm
- **Related specifications:** BUILD_05 (inspections), BUILD_43 (inspection form), BUILD_57 (mobile inspection — photo capture, signatures, voice notes)
- **Notes:** EXIF GPS + timestamp preservation is a non-negotiable per the system prompt. Photo compression is client-side before upload (1920×1440 at 70% JPEG, ~300KB) with EXIF extracted before compression since canvas strips metadata; server-side `sharp` is a safety net only.

## Purpose B15 — Maintenance management

- **Purpose name (internal):** `maintenance_management`
- **Description:** Accept maintenance requests from tenants (via portal, WhatsApp, or SMS), AI-triage for severity and category, assign to contractors, track progress, record completion, split costs between landlord / tenant / other parties per ADDENDUM_06A, handle delays and contractor communication.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (Rental Housing Act s4B habitability duty)
- **Personal data categories:** tenant name and contact details, description of the issue (may include health-adjacent info, e.g., "we have a baby and the heating is out"), photos of the issue, contractor assignment, cost allocation
- **Data subject categories:** tenants (as reporters); contractors; occasionally landlords when specific-owner-notification required
- **Recipients / Operators:** Supabase (storage), Africa's Talking (WhatsApp and SMS for contractor notifications), Anthropic (maintenance triage via `maintenance_triage` purpose — Purpose B22), Resend (email notifications)
- **Cross-border transfer:** Yes for AI and email; SMS/WhatsApp is domestic via Africa's Talking.
- **Retention:** 3 years post-completion (Tribunal evidentiary practice)
- **DPIA required:** No
- **Related specifications:** BUILD_06 (maintenance), BUILD_45 (maintenance UX), BUILD_19 (contractor portal), ADDENDUM_06A (cost split)

## Purpose B16 — Critical incident handling

- **Purpose name (internal):** `critical_incident`
- **Description:** Handle high-severity maintenance incidents (fire, burst pipe, major break-in, geyser failure) with an expedited workflow. Notify broker (for insurable events), owner, and managing scheme in parallel. Record the incident and the decisions taken. Integrates with insurance claim preparation.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(d) legal obligation + s11(1)(e) legitimate interest of a third party (insurance claim preparation) + s11(1)(f) Responsible Party's legitimate interest
- **Personal data categories:** as Purpose B15 plus insurance broker and policy contact details, owner notification preferences, scheme notification preferences
- **Data subject categories:** tenants, contractors, brokers, landlords, scheme contacts
- **Recipients / Operators:** Supabase (storage), Resend (broker and scheme notifications), Africa's Talking (urgent contractor dispatch)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** 5 years (insurance claim evidence + Tribunal evidentiary practice)
- **DPIA required:** No
- **Related specifications:** BUILD_59 (insurance, broker, scheme)

## Purpose B17 — Tenant communications lifecycle

- **Purpose name (internal):** `tenant_communications`
- **Description:** The tenant-facing communication layer across the full tenancy — rent invoices, payment receipts, monthly statements, arrears escalation, lease lifecycle events, inspection reminders, maintenance updates, deposit events, portal invitations, retry cascades, delivery tracking. WhatsApp-primary with SMS backup per BUILD_63.
- **Controller:** Agency (Responsible Party); Pleks (Operator); Africa's Talking and Meta (WhatsApp Business) as sub-Operators
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (RHA and CPA specific notice obligations; mandatory comms bypass tenant opt-out preferences)
- **Personal data categories:** tenant name, contact phone, contact email, message body, delivery status, WhatsApp template variant used, communication preferences (for non-mandatory comms)
- **Data subject categories:** tenants; co-tenants on joint leases
- **Recipients / Operators:** Africa's Talking (WhatsApp via Meta Business, SMS), Resend (email), Meta (WhatsApp Business Platform), Supabase (storage with full-body retention for Tribunal evidence)
- **Cross-border transfer:** Yes — Meta WhatsApp Business is US/IE; Resend is US. See Appendix B.
- **Retention:** 5 years post-termination per D-POPIA-02 (aligned with trust records per founder call; Tax Administration Act support)
- **DPIA required:** No — routine tenant communication under established channels
- **Related specifications:** BUILD_58 (WhatsApp via Africa's Talking), BUILD_63 (tenant communication lifecycle), ADDENDUM_48A (comms foundation)

## Purpose B18 — Supplier / contractor management

- **Purpose name (internal):** `supplier_management`
- **Description:** Maintain the agency's list of contractors and suppliers, their trade categories, FFC and PPRA status where applicable, contact details, job history with the agency, invoice submissions, payments. Support the contractor portal for job communication and status updates.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (contractor mandate for specific jobs) + s11(1)(c) compliance with law (agency's duty to verify contractor legitimacy in some cases)
- **Personal data categories:** contractor name, contact details, trade, rates, FFC number if applicable, bank details for payment (encrypted), job history, invoice submissions
- **Data subject categories:** contractors (sole proprietors are natural persons; limited-company contractors are juristic with natural-person directors subject to POPIA)
- **Recipients / Operators:** Supabase (storage), Resend / Africa's Talking (communications)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** 5 years from last engagement (Tax Administration Act)
- **DPIA required:** No
- **Related specifications:** BUILD_19 (contractor portal), ADDENDUM_19A (tier gating), BUILD_06B (supplier invoices)

## Purpose B19 — Municipal bill processing

- **Purpose name (internal):** `municipal_bill_processing`
- **Description:** Parse municipal bills (rates, water, electricity, refuse) via AI extraction when uploaded by the agent. Allocate charges across properties when the bill covers multiple units. Flag anomalies (sudden increases, unusual consumption). Support payment tracking.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(b) performance of contract (mandate to manage property expenses) + s11(1)(c) compliance with law (PPRA property-management record keeping)
- **Personal data categories:** property address (may identify the landlord), account holder (usually the landlord), municipal account number, consumption and charge data
- **Data subject categories:** landlords (as account holders)
- **Recipients / Operators:** Supabase (storage), Anthropic (bill extraction via `municipal_bill_extraction` purpose — Purpose B22)
- **Cross-border transfer:** Yes — AI processing.
- **Retention:** 5 years (Tax Administration Act)
- **DPIA required:** No
- **Related specifications:** BUILD_13 (municipal bills)

## Purpose B20 — HOA / Body Corporate / Managing Scheme

- **Purpose name (internal):** `hoa_scheme_management`
- **Description:** For properties in a Homeowners Association or Body Corporate, manage levy schedules, AGM documents, reserve fund contributions, levy arrears, scheme contact details. Integrates with BUILD_59 scheme and BUILD_18 HOA module.
- **Controller:** Agency (Responsible Party) / Managing scheme (joint Responsible Party depending on agreement); Pleks (Operator)
- **Lawful basis (POPIA s11):** s11(1)(b) performance of contract + s11(1)(c) compliance with law (Sectional Titles Schemes Management Act)
- **Personal data categories:** scheme contact details, levy payment history per owner, AGM attendance and voting records where relevant
- **Data subject categories:** scheme trustees, body corporate members, scheme managers, owners (landlords) with levy obligations
- **Recipients / Operators:** Supabase (storage), Resend (AGM and levy communications), Anthropic (AGM notice drafting — Purpose B22)
- **Cross-border transfer:** Yes for AI processing.
- **Retention:** 5 years (STSMA and tax retention); AGM records indefinitely per scheme bylaws
- **DPIA required:** No
- **Related specifications:** BUILD_18 (HOA module), BUILD_59 (managing scheme), ADDENDUM_18A (HOA levy calculation)

## Purpose B21 — Document generation and storage (welcome packs, reports, templates)

- **Purpose name (internal):** `document_generation`
- **Description:** Generate derivative documents from structured data — landlord welcome pack, tenant welcome pack, monthly reports, AGM notices, lease cover sheets, letters of demand, final notices, deposit deduction schedules. Storage in Supabase Storage under path-scoped RLS.
- **Controller:** Agency (Responsible Party); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** follows from the underlying purpose each document supports
- **Personal data categories:** depends on the document type
- **Data subject categories:** depends on the document type
- **Recipients / Operators:** Supabase Storage, Anthropic (for AI-drafted content — Purpose B22)
- **Cross-border transfer:** Yes for AI; domestic for storage.
- **Retention:** follows the underlying purpose (5 years for leases, 3 years for inspections, etc.)
- **DPIA required:** No — derivative processing of data already covered by upstream purposes
- **Related specifications:** BUILD_53 (landlord welcome pack), BUILD_54 (tenant welcome pack), ADDENDUM_57E (document generation), BUILD_52 (reports)

## Purpose B22 — AI-assisted processing (Anthropic)

- **Purpose name (internal):** `ai_assisted_processing` (composite — individual AI purposes enumerated below)
- **Description:** Use Anthropic's Claude models (Haiku 4.5, Sonnet 4.6, Opus 4.6) to perform specific bounded tasks on personal information, via the `lib/ai/client.ts` wrapper as the single permitted entry point. Every AI call is attributed per organisation, per purpose, per model, and per token count for cost observability (Purpose A6). **No PII is stored in `ai_usage.metadata`** — purpose-specific structured data only. Prompt and response content is not retained by Pleks; Anthropic's own retention for the API call is per their DPA (zero-day retention on Enterprise plans).
- **Enumerated AI sub-purposes** (current):
  - `maintenance_triage` (Haiku) — categorise and prioritise maintenance requests
  - `municipal_bill_extraction` (Haiku) — extract structured data from municipal bill PDFs
  - `inspection_assessment` (Sonnet) — wear-and-tear vs damage classification with justification
  - `fitscore_summary` (Sonnet) — applicant suitability narrative
  - `income_extraction` (Sonnet) — extract income from bank statements
  - `lease_clause_reformat` (Haiku) — reformat user-provided clause text to platform voice
  - `clause_conflict_check` (Sonnet) — check for conflicts between selected clauses
  - `arrears_communication` (Sonnet) — generate tone-appropriate arrears messages
  - `lod_generation` (Sonnet) — letter of demand drafting
  - `final_notice_generation` (Sonnet) — pre-cancellation notice drafting
  - `deposit_deduction_justification` (Sonnet) — justification narrative for deduction schedule
  - `welcome_pack_landlord` (Sonnet) — landlord welcome pack narrative
  - `welcome_pack_tenant` (Sonnet) — tenant welcome pack narrative
  - `agm_notice` (Sonnet) — AGM notice drafting
  - `trust_audit_narrative` (Sonnet) — variance explanation narrative for trust audit
  - `popia_export_narrative` (Sonnet) — subject access export narrative (new in BUILD_65)
  - `tribunal_narrative` (Sonnet, with Opus opt-in at Firm tier — reserved for BUILD_66)
- **Controller:** Agency (Responsible Party) for Operator-facing sub-purposes; Pleks (Responsible Party) for any Pleks-internal AI sub-purposes (currently none)
- **Lawful basis (POPIA s11):** follows the underlying purpose each sub-purpose serves
- **Personal data categories:** depends on the sub-purpose; inspection photos, bank statement content, communication text, lease clauses, maintenance descriptions, credit check outputs
- **Data subject categories:** tenants, landlords, applicants — follows the underlying purpose
- **Recipients / Operators:** Anthropic (see Appendix A)
- **Cross-border transfer:** **Yes — Anthropic's API infrastructure is US-based.** Basis: s72(1)(b) SCCs via Anthropic's DPA + s72(1)(a) consent where the sub-purpose requires explicit consent (e.g., credit check derivatives).
- **Retention:** Pleks does not retain prompts or responses; `ai_usage` (cost metadata, no PII) retained 2 years per Purpose A6
- **DPIA required:** Yes (composite) — AI-assisted processing is novel and has privacy implications; the DPIA covers the wrapper, the purpose enumeration, and the no-PII-in-metadata discipline. Individual sub-purposes do not trigger additional DPIA unless they introduce new data categories.
- **Related specifications:** ADDENDUM_00H (AI wrapper + cost observability), every build that adds a new `AiPurpose` enum value
- **Notes:** The ESLint `no-restricted-imports` rule enforces that no code imports `@anthropic-ai/sdk` directly — every AI call must go through `lib/ai/client.ts`. This is the choke point that makes AI purpose accounting possible.

## Purpose B23 — POPIA data-subject request handling

- **Purpose name (internal):** `popia_dsr_handling`
- **Description:** Receive, verify, review, resolve, and communicate data-subject requests (access, correction, erasure, objection, restriction, portability, consent withdrawal, full erasure / nuke) under POPIA Chapter 3. Generate export bundles (PDF + JSON + ZIP with manifest-hash tamper-evidence). Execute retention-aware erasure cascades. Route requests that reach Pleks directly to the correct agency Responsible Party. This purpose is meta — it's the processing of data *about* the exercise of rights, not about the subject's underlying data.
- **Controller:** Agency (Responsible Party) for Operator-operated DSRs; Pleks (Responsible Party) for Pleks-RP DSRs (platform account data)
- **Lawful basis (POPIA s11):** s11(1)(c) compliance with law (POPIA s23–s25 data-subject rights enforcement)
- **Personal data categories:** subject name, contact email, ID (optional last 4), subject-submitted narrative, supporting documents, resolution notes, carve-out acknowledgements, export artefacts
- **Data subject categories:** any natural person exercising POPIA rights via Pleks
- **Recipients / Operators:** Supabase (storage), Resend (resolution emails), Anthropic (export narrative — Purpose B22 sub-purpose `popia_export_narrative`)
- **Cross-border transfer:** Yes — see Appendix B.
- **Retention:** the `data_subject_requests` row is immutable history (never deleted); the export artefact is retained with a 7-day download link and kept indefinitely on the server side for regeneration; resolution notes retained alongside the request
- **DPIA required:** No — the purpose is POPIA-mandated accountability processing
- **Related specifications:** BUILD_65 (POPIA customer-facing surface) — this purpose is the reflexive one the BUILD_65 spec and this register both exist to enable

---

## Purpose B24 — FICA / KYC documentation storage for accountable institutions

- **Purpose name (internal):** `fica_kyc_storage`
- **Description:** Store customer due diligence (CDD) documentation that agencies are required to collect under the Financial Intelligence Centre Act (FIC Act) as Schedule 1 Accountable Institutions (Item 20 — estate agents). This includes identity documents (SA ID card/book, passport for foreign nationals), proof of residential address, source-of-funds documentation where applicable, enhanced due diligence (EDD) notes where a higher-risk rating applies, and CDD-related records tied to specific clients. Pleks stores the artefacts as Operator. **Pleks does not perform FICA verification itself** — the Accountable Institution (the agency) is solely responsible for CDD, risk rating, record-keeping obligations, and any suspicious-transaction reports to the Financial Intelligence Centre (FIC) via the goAML system. Pleks provides the storage, retrieval, and audit-trail infrastructure the agency needs to satisfy its FICA obligations; the agency remains solely accountable for their fulfilment.
- **Controller:** Agency (Responsible Party and Accountable Institution under FIC Act); Pleks (Operator)
- **Lawful basis (POPIA s11) (agency's):** s11(1)(c) compliance with law (FIC Act s21–s26 CDD obligations; s42–s43 record-keeping obligations for Accountable Institutions)
- **Personal data categories:** full name, ID number, passport number (foreign nationals), date of birth, nationality, residential address, proof-of-address document (utility bill, bank statement), employment and income details where collected, source-of-funds documentation where applicable, risk rating assigned by the agency, CDD decision record, EDD notes if higher-risk
- **Data subject categories:** clients of the agency as defined by FIC Act — typically landlords (as beneficial owners of rental income) and tenants entering into leases that meet the threshold triggering CDD; also beneficial owners of juristic landlords where applicable
- **Recipients / Operators:** Supabase (storage of documents and structured CDD records)
- **Cross-border transfer:** Yes — Supabase is US-routed. Basis: s72(1)(b) SCCs + s72(1)(c) necessity for the agency's compliance with SA law; the data originates in SA and returns to SA for agency access
- **Retention:** 5 years from the end of the business relationship (FIC Act s42/s43); 5 years after the date of the relevant transaction for transaction records; longer if the agency is subject to an ongoing FIC investigation (in which case retention continues until instructed otherwise). This retention clock is independent of the lease retention clock — the two run in parallel and the longer controls.
- **DPIA required:** No — FICA compliance is a well-established regulatory processing category; the risk is well understood and the FIC Act itself prescribes safeguards
- **Related specifications:** none dedicated currently — CDD documents are captured via the standard document-upload flow in BUILD_02 (properties / landlords) and BUILD_03 (tenants / applications); a Tier 2 ADDENDUM would add FICA-specific workflow (CDD checklist UI, EDD templates, retention countdown display, risk-rating audit trail) if customer demand warrants it
- **Notes:** Pleks does not integrate with the FIC's goAML reporting system, does not generate Suspicious Transaction Reports (STRs), and does not interpret risk ratings. These remain entirely agency responsibilities. Agencies carrying FICA obligations must complete their own Risk Management and Compliance Programme (RMCP) under FIC Act s42 and should reference Pleks as an Operator / record-storage partner in that RMCP.

## Purpose B25 — Agency-originated direct marketing to tenants via the platform [reserved — not currently deployed]

- **Purpose name (internal):** `agency_direct_marketing` (reserved)
- **Description:** This purpose is reserved and defined in advance, but **not currently deployed**. It covers the hypothetical future case where an agency uses Pleks to send direct marketing to its own tenants — for example, cross-selling contents insurance, offering home-care services, advertising a new property for the tenant's renewal consideration, or promoting a partner product. Pleks currently sends only transactional and legal communications on behalf of agencies (Purpose B17); no direct marketing. If and when an agency wishes to enable marketing messaging, this purpose becomes active and this register is updated to `2026.2` with the re-consent notification flow triggered per BUILD_65 §5.
- **Controller:** Agency (Responsible Party); Pleks (Operator). The agency's relationship with its tenants is a customer-relationship under POPIA s69, which affects the lawful-basis analysis (opt-out may be sufficient for existing customers versus opt-in for non-customers).
- **Lawful basis (POPIA s11):** **To be confirmed per deployment context.** For marketing to existing tenants (who are existing customers of the agency), POPIA s69(3)(a) permits processing on an opt-out basis provided the communication offers an opt-out mechanism and identifies the sender. For marketing to non-customers, POPIA s69(1) requires opt-in consent. The agency, as Responsible Party, is responsible for establishing the correct basis before sending.
- **Personal data categories (when active):** tenant name, contact phone, contact email, communication preferences, marketing-opt-out state, tenancy relationship context (which agency, which property, relationship duration)
- **Data subject categories (when active):** tenants of the agency; secondary occupants who have consented to communications
- **Recipients / Operators (when active):** Supabase, Resend (email), Africa's Talking (WhatsApp and SMS), possibly Anthropic (if AI-generated marketing content is used — Purpose B22)
- **Cross-border transfer (when active):** Yes — see Appendix B
- **Retention (when active):** communication record retention follows Purpose B17 (5 years post-termination); opt-out state retained indefinitely until the data subject requests otherwise and no other lawful basis requires retention
- **DPIA required:** Yes — will be assessed at the point of deployment because direct marketing triggers distinct POPIA s69 and CPA s32 compliance considerations, and because the risk-of-harm balance to data subjects changes when messaging shifts from transactional to persuasive
- **Related specifications:** none currently; a future build spec or ADDENDUM will formalise the deployment, including consent UX, opt-out mechanism, segmentation tooling, and tier gating
- **Notes:** This placeholder exists so that agencies reviewing the register before procurement can confirm that **Pleks does not currently send marketing to their tenants**, and so that any future change of posture is surfaced in a `2026.N` material-change update with clear notification to data subjects. Pleks's own marketing to Pleks's own prospects (Purpose A7 — waitlist) is a separate purpose and is unaffected.

---

# Appendix A — Recipients & Operators directory

Every third party Pleks uses in the course of processing personal information. For each: what they do, where they are domiciled, what contractual instrument governs the relationship, and what safeguards are in place.

## A1 — Supabase

- **Role:** Backend-as-a-service — Postgres database, authentication, storage, realtime, edge functions
- **Domicile:** US parent, with regional data residency available (current Pleks project region: **[region to be confirmed — configurable per project]**)
- **Purposes served:** A1–A12 (all Pleks-RP), B1–B23 (all Operator) — Supabase is the foundational data platform
- **Contract instrument:** Supabase Terms of Service + Data Processing Addendum with Standard Contractual Clauses
- **Sub-Operator hierarchy:** Supabase uses AWS as its underlying cloud provider (separate sub-processor agreement)
- **Safeguards:** encryption at rest (AES-256 per Supabase), encryption in transit (TLS 1.2+), RLS enforced for all client queries, service role reserved for server-side only, gateway helper enforces org-scoped queries per CLAUDE.md gateway discipline

## A2 — Anthropic

- **Role:** AI model provider — Claude Haiku 4.5, Sonnet 4.6, Opus 4.6 for bounded task processing (Purpose B22)
- **Domicile:** US (San Francisco)
- **Purposes served:** B22 (all AI sub-purposes), A9 (if AI is ever used in support — not currently)
- **Contract instrument:** Anthropic Commercial Terms + Data Processing Addendum with Standard Contractual Clauses; enterprise-tier zero-retention agreement to ensure API inputs and outputs are not retained for training or other purposes
- **Sub-Operator hierarchy:** Anthropic uses AWS and Google Cloud infrastructure
- **Safeguards:** no PII in `ai_usage` metadata, purpose-specific structured context only, prompts and responses never retained by Pleks, zero-retention Enterprise DPA; TLS in transit

## A3 — Sentry (Functional Software, Inc. t/a Sentry)

- **Role:** Error monitoring and exception tracking (Purpose A3)
- **Domicile:** US (San Francisco); EU region available but not currently enabled
- **Purposes served:** A3 only
- **Contract instrument:** Sentry Terms of Service + Data Processing Addendum with Standard Contractual Clauses
- **Safeguards:** aggressive PII scrubber at `lib/observability/scrubbing.ts` runs before transmission; user context limited to `user_id` + `org_id` + `role`; no email, name, phone, IP, browser fingerprint, request body, response body, session cookie, or local variables transmitted; 90-day Sentry retention; user opt-out respected client-side and server-side
- **Migration plan:** EU region migration is a Tier 2 follow-on per ADDENDUM_00E to reduce cross-border transfer scope

## A4 — Resend

- **Role:** Transactional and marketing email delivery
- **Domicile:** US
- **Purposes served:** A1, A2, A4, A7, A8, A9, A10, A12 (Pleks-RP comms); B2, B10, B11, B16, B17, B20, B21, B23 (agency-side email)
- **Contract instrument:** Resend Terms of Service + Data Processing Addendum with Standard Contractual Clauses
- **Safeguards:** TLS in transit; Resend does not retain email content beyond delivery confirmation window; DKIM/SPF/DMARC alignment on sending domain; suppression list honoured for unsubscribe requests per POPIA s69 / CPA s32

## A5 — Africa's Talking

- **Role:** SMS and WhatsApp Business Platform aggregation for South African mobile networks
- **Domicile:** Kenya (Nairobi)
- **Purposes served:** B2, B11, B15, B16, B17, B18 (agency-side SMS and WhatsApp comms)
- **Contract instrument:** Africa's Talking Terms of Service + Data Processing Addendum
- **Sub-Operator hierarchy:** Africa's Talking routes WhatsApp through Meta (WhatsApp Business Platform) and SMS through local mobile network operators (MTN, Vodacom, Cell C, Telkom); see A9 for Meta
- **Safeguards:** TLS in transit; inbound webhook HMAC verification in Pleks; CS-window tracking in `whatsapp_cs_windows` for regulatory compliance; STOP keyword consent withdrawal honoured

## A6 — Peach Payments

- **Role:** DebiCheck mandate management and rent collection processing
- **Domicile:** South Africa (Cape Town) — domestic
- **Purposes served:** B8 (DebiCheck collection only)
- **Contract instrument:** Peach Payments Terms of Service + Data Processing Addendum
- **Safeguards:** PCI DSS Level 1 compliance at Peach; Pleks is on the PCI boundary (passes through rather than storing card data); DebiCheck mandate authentication per SARB TA-01 regulations; no outbound payment rails (invariant per BUILD_64)

## A7 — PayFast (t/a Network International South Africa)

- **Role:** Payment gateway for application fees (Purpose B9) and initial Pleks subscription payments
- **Domicile:** South Africa (Cape Town) — domestic
- **Purposes served:** B9, A8 (limited)
- **Contract instrument:** PayFast Merchant Agreement
- **Safeguards:** PCI DSS Level 1; Pleks never sees full card PAN; Instant Transaction Notification (ITN) signature verification before processing in Pleks

## A8 — DocuSeal

- **Role:** Digital signature and document-signing workflow (self-hosted instance on infrastructure Pleks controls)
- **Domicile:** self-hosted on Supabase / Vercel infrastructure — effectively the same privacy boundary as Pleks
- **Purposes served:** B6 (lease signing)
- **Contract instrument:** DocuSeal open-source licence; no third-party DPA necessary because no data leaves Pleks's infrastructure
- **Safeguards:** same as Supabase and Vercel

## A9 — Meta Platforms (WhatsApp Business)

- **Role:** Upstream WhatsApp Business Platform provider (reached via Africa's Talking)
- **Domicile:** US (California), with some routing through Ireland (EU)
- **Purposes served:** B17 (tenant communications via WhatsApp)
- **Contract instrument:** Meta's terms are mediated through the Africa's Talking relationship; Meta's direct terms apply to WhatsApp Business Platform users
- **Safeguards:** Meta-approved templates for transactional messages; 24-hour customer-service window tracking; opt-in consent captured and retained; unsubscribe via STOP honoured

## A10 — Better Stack

- **Role:** Uptime monitoring, heartbeat tracking, alerting
- **Domicile:** US (Delaware)
- **Purposes served:** A5 only
- **Contract instrument:** Better Stack Terms of Service + Data Processing Addendum
- **Safeguards:** no PII in probe traffic; alerts contain only component health text

## A11 — Vercel

- **Role:** Next.js hosting, edge-function invocation, CDN
- **Domicile:** US (San Francisco) with global edge presence
- **Purposes served:** A1–A12, B1–B23 — hosts the entire Pleks application
- **Contract instrument:** Vercel Terms of Service + Data Processing Addendum
- **Safeguards:** TLS in transit; Vercel does not retain request bodies beyond normal HTTP edge-log retention (configurable, default 30 days); CSP headers applied; logs POPIA-scrubbed consistent with ADDENDUM_00E

## A12 — Searchworx

- **Role:** Credit bureau aggregator (TransUnion, Experian, Compuscan, XDS) + Lightstone AVM + Deeds Office lookups
- **Domicile:** South Africa (Johannesburg) — domestic
- **Purposes served:** B4 (credit check)
- **Contract instrument:** Searchworx Services Agreement + POPIA-compliant DPA; Searchworx is itself an Operator to the agency (via Pleks as onward Operator)
- **Safeguards:** explicit applicant consent captured before each check; per-check billing (applicant pays); no bulk retrieval; 12-month Pleks-side retention of results; underlying bureau retention per bureau's own policy
- **Notes:** Searchworx API access is [pending as of register publication — to be confirmed]; in the interim, Phase 1 manual trigger pattern is in use per the system prompt.

## A13 — GitHub

- **Role:** Source-code hosting; incidental processing of developer PII (commit authors)
- **Domicile:** US (San Francisco) — subsidiary of Microsoft
- **Purposes served:** none for customer data; contributor identities only
- **Contract instrument:** GitHub Terms of Service
- **Safeguards:** no customer data in code; secret-scanning enabled; Dependabot enabled

## A14 — Others / to be confirmed

- **Google Workspace** (if deployed for `support@pleks.co.za` inbox) — US-domiciled, SCCs apply
- **Stripe / future billing provider** — deferred, not currently deployed
- **Analytics tool** — deliberately not deployed (see Purpose A11)

---

# Appendix B — Cross-border transfer schedule

Every transfer of personal information outside South Africa. Under POPIA s72, cross-border transfers require one of the following bases:

- **s72(1)(a)** — data subject has consented to the transfer
- **s72(1)(b)** — transfer is necessary for the performance of a contract between the data subject and the Responsible Party, or of pre-contract steps at the subject's request
- **s72(1)(c)** — transfer is necessary for the conclusion or performance of a contract concluded in the interest of the data subject between the Responsible Party and a third party
- **s72(1)(d)** — transfer is for the benefit of the data subject and consent cannot reasonably be obtained; benefit would likely be given
- **s72(1)(e)** — recipient is subject to a law or binding corporate rules or binding agreement providing an adequate level of protection substantially similar to POPIA (this is the typical SCC basis in SaaS operator agreements)

| Recipient | Domicile | Purposes served | Primary basis | Supporting instrument |
|-----------|----------|-----------------|---------------|-----------------------|
| Supabase | US (with regional routing) | A1–A12, B1–B25 (B24 active; B25 when deployed) | s72(1)(e) SCCs | Supabase DPA |
| Anthropic | US | B22 (and its sub-purposes) | s72(1)(e) SCCs + s72(1)(a) explicit consent for credit-check derivatives | Anthropic Enterprise DPA (zero-retention) |
| Sentry | US | A3 | s72(1)(e) SCCs | Sentry DPA |
| Resend | US | A1, A2, A4, A7, A8, A9, A10, A12, B2, B10, B11, B16, B17, B20, B21, B23 | s72(1)(e) SCCs + s72(1)(b) performance of contract | Resend DPA |
| Meta (via Africa's Talking) | US / IE | B17 (WhatsApp) | s72(1)(e) SCCs + s72(1)(a) consent at WhatsApp opt-in | Meta Business Platform terms |
| Africa's Talking | Kenya | B2, B11, B15, B16, B17, B18 | s72(1)(e) SCCs; Kenya has a Data Protection Act (2019) providing substantially similar protection | Africa's Talking DPA |
| Better Stack | US | A5 | s72(1)(e) SCCs; no PII transferred | Better Stack DPA |
| Vercel | US (with global edge) | A1–A12, B1–B25 (hosting) | s72(1)(e) SCCs | Vercel DPA |
| GitHub | US | contributor identities only; no customer data | s72(1)(e) SCCs | GitHub Terms |

**Domestic-only recipients (no s72 transfer):** Peach Payments (SA), PayFast (SA), Searchworx (SA), mobile network operators via Africa's Talking downstream (SA). DocuSeal is self-hosted — no external transfer.

**SCC framework:** Pleks's standard Operator-to-subprocessor contractual clauses are modeled on the EU GDPR SCCs adapted for POPIA compatibility. Each vendor's DPA either uses its own SCC equivalent or accepts Pleks's SCCs as a schedule.

---

# Appendix C — Special personal information map (POPIA s26)

POPIA s26 defines "special personal information" as information concerning a data subject's religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, or criminal behaviour. Processing of s26 categories is generally prohibited unless a s27 justification applies.

**Pleks does not deliberately process s26 categories.** The following boundaries are documented honestly because they may touch s26-adjacent data incidentally:

## C1 — Biometric information (signatures and photos)

**Signatures** captured during lease signing (BUILD_06), inspection sign-off (BUILD_05), and document signing (ADDENDUM_57E) are handwritten signature images. SA law (Electronic Communications and Transactions Act s13 + POPIA s26) treats handwritten signatures as **not automatically biometric information** — biometric data under s26 is specifically defined as identifying information derived from physical, physiological, behavioural, or biological techniques used for identification (e.g., fingerprints, iris scans, voice prints, facial recognition embeddings). A signature image used for authenticity verification is covered under ordinary PI, not s26.

**Photos** captured during inspections (BUILD_05, BUILD_57) may incidentally capture faces of persons in or near the property. This is incidental, not deliberate biometric processing — Pleks does not run facial recognition, does not extract face embeddings, and does not index photos by identified individuals. The inspection workflow addresses the property, not the persons in it.

**No s26 biometric processing is performed by Pleks.**

## C2 — Health information

**Maintenance requests** (BUILD_06) are a known incidental source — a tenant may volunteer health-adjacent context ("we have a baby and the heating is broken", "my mother has asthma and there is mould"). Pleks captures this context in the maintenance request body but does not categorise it as health information, does not index maintenance requests by health status, and does not process it for any purpose beyond responding to the maintenance issue. The field is free-text; the subject has consented to the communication by submitting it.

**Emergency contact fields** may incidentally capture relationships that imply health information (a named caregiver, for example). Same boundary as above — incidental, not deliberate.

**Accessibility accommodations in lease clauses** may touch health-adjacent information if an agency adds a custom clause referencing a specific tenant accommodation. Pleks's clause library does not include such clauses; if an agency adds one, the agency carries the s26 justification burden.

## C3 — Criminal behaviour

**Credit check results** (B4) may include court judgment records and default history. SA law is narrower than EU GDPR on "criminal behaviour" — civil judgments and credit defaults are not s26 criminal-behaviour data; actual criminal records are. Searchworx's credit bureau products return civil judgments (not s26) and do not return criminal records (out of scope for the credit-check product).

**Police clearance certificates** are not collected by Pleks in the standard application flow. Some agencies may request them separately and store them as document attachments; the agency carries the s26 justification burden if they do.

## C4 — Race, religion, political persuasion

None collected deliberately. Any incidental mention in free-text fields is not processed as s26 data.

## C5 — Trade union membership, sex life

None collected.

---

# Appendix D — DPIA framework

A Data Protection Impact Assessment (DPIA) is conducted when a new processing purpose meets any of the following triggers:

1. **Novel technology or processing method** (e.g., product analytics deployment, automated decision-making beyond current FitScore design, biometric processing introduction)
2. **Processing of special personal information under POPIA s26** at any non-incidental scale
3. **Automated decision-making with legal or similarly significant effect on the data subject** (POPIA s71)
4. **Large-scale processing of credit or financial information** beyond the current per-applicant bureau check (e.g., bulk credit portfolio analytics)
5. **Processing of children's personal information** at non-incidental scale
6. **Cross-border transfer to a jurisdiction without equivalent law** (current status: all cross-border transfers are to jurisdictions where SCCs establish equivalence)
7. **Information Regulator guidance** identifying a processing type as high-risk

**Current DPIAs on file:**

- **Purpose B4 — Credit checking (Searchworx):** DPIA documented at [internal DPIA register — to be completed before first paying customer]
- **Purpose B5 — FitScore generation:** covered under B4 DPIA with automated-decision-making angle addressed
- **Purpose B22 — AI-assisted processing:** composite DPIA covering the wrapper choke point, per-sub-purpose data categories, no-PII-in-metadata discipline, and Anthropic zero-retention agreement

**Future DPIAs required before deployment:**

- Product analytics (Purpose A11) — whenever a tool is chosen
- Bulk imports touching new PII categories — assessed per import
- Any new AI sub-purpose introducing new data categories beyond those covered in B22's composite DPIA
- **Purpose B25 — Agency-originated direct marketing** — DPIA required at point of deployment (see B25 notes); covers POPIA s69 and CPA s32 considerations

---

# Appendix E — Data subject rights exercise quick reference

See BUILD_65 and the surfaces at `/tenant/privacy`, `/landlord/privacy`, `/supplier/privacy`, `/settings/privacy/my-data`, `/admin/popia-requests`. This appendix is a reference; the canonical UX lives in the platform.

| POPIA section | Right | How Pleks supports it |
|---|---|---|
| s23 | Access (right to know and obtain a copy) | `access` request type; PDF + JSON + ZIP bundle |
| s24 | Correction and deletion (inaccurate, irrelevant, excessive, out of date, misleading, unlawful) | `correction` and `erasure` request types with retention-aware cascade |
| s25 | Refund / destruction of records | handled within `erasure` and `nuke` flows |
| s11(3) | Objection to processing | `objection` request type |
| — (POPIA principle) | Restriction of processing | `restriction` request type |
| — (portability, implicit) | Portability | `portability` request type (JSON artefact) |
| s11(2)(b) | Withdrawal of consent | `consent_withdrawal` request type |
| Pleks product commitment (exceeds POPIA) | Full erasure with disclosed carve-outs | `nuke` request type with pre-submission carve-out disclosure |
| Chapter 10 | Complaint to the Information Regulator | IR contact surfaced on every privacy page and every rejection email; Pleks does not intermediate |

---

*End of PROCESSING_PURPOSES.md · Version 2026.1 · 2026-05-01*

*Authored 2026-04-20 · Cape Town · Pleks / Yoros Bouwer Property Group*

*Source of truth: `brief/legal/PROCESSING_PURPOSES.md` in the Pleks repository.*
