/**
 * lib/legal/popia-purposes.ts — POPIA s17/s18 processing-purpose definitions
 *
 * Notes:  Single source of truth for all 39 processing purposes.
 *         12 Part A (Pleks as Responsible Party) + 27 Part B (Pleks as Operator).
 *         Spec: ADDENDUM_00J §4.1
 */
import type { ReactNode } from "react"

export interface PopiaProcessingPurpose {
  id: string              // 'A1', 'A2', ..., 'B27'
  slug: string            // from the <code className="purpose-slug"> element
  title: string           // from the <span> after the id span
  description: ReactNode  // from <p className="purpose-desc"> elements
  lawfulBasis: string     // from pm-row Lawful basis
  data: string            // from pm-row Data
  recipients: string      // from pm-row Recipients
  retention: string       // from pm-row Retention
  crossBorder: string     // from pm-row Cross-border
  dpia?: string           // from pm-row DPIA (B26, B27 only)
  notDeployed?: boolean   // true for A11 and B25
  notDeployedLabel?: string  // badge text; defaults to "Not deployed" if omitted
}

export const POPIA_PURPOSES: readonly PopiaProcessingPurpose[] = [
  // ─── Part A — Pleks as Responsible Party ───────────────────────────────────

  {
    id: "A1",
    slug: "platform_authentication",
    title: "Platform authentication",
    description: "Allow users (agents, tenants, landlords, suppliers, applicants) to sign in and maintain an authenticated session. Covers email/password, magic-link, session cookie issuance, expiry, and logout.",
    lawfulBasis: "s11(1)(b) — performance of contract (Terms of Service)",
    data: "email address, password hash (bcrypt), session tokens, IP address, user agent, authentication event timestamps",
    recipients: "database and storage provider, transactional email provider (magic-link and new-device notifications)",
    retention: "Sessions: 30 days after expiry · Auth events: 7 years · Account records: purged 30 days after account closure",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A2",
    slug: "mfa_totp_passkeys",
    title: "Multi-factor authentication",
    description: "Enforce MFA for agent accounts (mandatory) and offer optional MFA for tenant/landlord/supplier accounts. Includes TOTP enrolment via authenticator app, passkey (WebAuthn) registration, and step-up challenges for fiduciary-class actions. Passkey biometric matching (fingerprint / face) occurs entirely on the user’s device via the WebAuthn protocol; Pleks receives only the public key and credential ID — not biometric samples — so passkey enrolment does not constitute processing of biometric information under POPIA s26.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (POPIA s19 security safeguards)",
    data: "TOTP secret (encrypted), passkey credential ID, passkey public key, credential counter, device name, enrolment timestamps, IP at enrolment",
    recipients: "database and storage provider, transactional email provider (enrolment/unenrolment notifications)",
    retention: "7 years alongside auth events · revoked passkey records purged after 30 days",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A3",
    slug: "error_monitoring",
    title: "Error monitoring and exception tracking",
    description: "Capture unhandled exceptions and server/client-side errors to detect and fix defects. Every event routed through a POPIA-safe scrubber that removes request bodies from sensitive routes and strips known PII patterns from all payloads before transmission to the error monitoring provider (see §C).",
    lawfulBasis: "s11(1)(f) — legitimate interest (detection and remediation of platform defects is necessary for a reliable service)",
    data: "User ID (UUID), organisation ID, role, release version, error type, stack trace, route path (query parameters stripped). No email, name, phone, IP, request body, or session cookie.",
    recipients: "error monitoring provider (see §C)",
    retention: "90 days at the error monitoring provider (provider default) · Pleks does not retain error events independently",
    crossBorder: "Yes — SCCs (s72(1)(a)) + PII scrubber removes personal information at source",
  },
  {
    id: "A4",
    slug: "user_feedback",
    title: "In-product user feedback",
    description: "Capture free-text feedback, bug reports, and feature requests via the floating feedback button on authenticated layouts. Support reply-by-email. Used to prioritise product development.",
    lawfulBasis: "s11(1)(a) — consent (user explicitly initiates submission) + s11(1)(b) — contract (responding to user queries)",
    data: "User ID, organisation ID, role, feedback category, free-text body (may contain PII the user chooses to include), submission URL, user agent, release version",
    recipients: "database and storage provider, transactional email provider (reply delivery)",
    retention: "5 years from submission date, then anonymised to category + sentiment only (POPIA s14 — no longer than necessary) · free-text redacted to [deleted] on earlier deletion request",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A5",
    slug: "uptime_monitoring",
    title: "Uptime monitoring and health probes",
    description: "External probes of the /api/health and /api/health/deep endpoints to detect platform outages. Heartbeat monitoring on critical daily crons. Public status page reflecting component health and 30-day uptime history.",
    lawfulBasis: "s11(1)(f) — legitimate interest (platform availability monitoring is necessary for service reliability)",
    data: "None — probe traffic is system-to-system and contains only component health status text",
    recipients: "uptime monitoring provider (see §C), Slack (alert delivery)",
    retention: "30 days rolling at the uptime monitoring provider",
    crossBorder: "Yes — SCCs (s72(1)(a)) · no personal information transmitted in probe traffic",
  },
  {
    id: "A6",
    slug: "cost_usage_observability",
    title: "Cost and usage observability",
    description: "Track per-organisation resource consumption (emails, WhatsApp/SMS, AI calls, application hosting provider invocations, database provider compute) for unit-economics understanding, customer-facing usage counters, and overage billing where applicable.",
    lawfulBasis: "s11(1)(b) — contract (subscription and usage tracking) + s11(1)(f) — legitimate interest (platform economics)",
    data: "Organisation ID, AI purpose codes, model, token counts, cost in cents, latency, success/error codes. No prompt text, no response text, no PII in metadata.",
    recipients: "database and storage provider, application hosting provider (function invocation counts via management API)",
    retention: "AI usage rows: 2 years · cost snapshots: 36 months · messaging usage and subscription charges: 5 years (Tax Administration Act)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A7",
    slug: "marketing_waitlist",
    title: "Marketing waitlist",
    description: "Capture email addresses of prospective customers via the /early-access waitlist page. Send a confirmation email and, when early access is opened, a launch notification. Marketing list is explicitly opt-in per POPIA s69 direct-marketing rules.",
    lawfulBasis: "s11(1)(a) — consent (user explicitly submits the waitlist form)",
    data: "Email address, self-declared role, consent timestamp, IP address, user agent",
    recipients: "database and storage provider, transactional email provider (confirmation and launch emails)",
    retention: "Until account creation (waitlist linked to user via matching email), or 12 months from submission if no account created",
    crossBorder: "Yes — SCCs (s72(1)(a)) and s72(1)(b) consent basis",
  },
  {
    id: "A8",
    slug: "platform_billing",
    title: "Platform-level billing and subscriptions",
    description: "Manage Pleks’s own subscription billing to agencies — tier selection, per-lease premium charges, overage billing, invoicing, and payment processing via the payment gateway (see §C).",
    lawfulBasis: "s11(1)(b) — contract (Terms of Service) + s11(1)(c) — compliance with law (Tax Administration Act, VAT Act)",
    data: "Organisation billing contact name, email, phone, billing address, VAT number, invoice history, charge history, tier and feature selection, subscription state",
    recipients: "database and storage provider, transactional email provider (invoices), payment gateway (payment processing)",
    retention: "5 years from the date of the most recent charge (Tax Administration Act s29)",
    crossBorder: "Yes — SCCs (s72(1)(a)) + s72(1)(c) necessity for performance of contract · payment gateway is SA-domiciled (domestic)",
  },
  {
    id: "A9",
    slug: "support_communications",
    title: "Support communications",
    description: "Inbound email to support@pleks.co.za from users or non-users requesting assistance, and outbound responses. Includes POPIA data-subject requests that reach Pleks directly (routed to the correct Responsible Party).",
    lawfulBasis: "s11(1)(b) — contract (support is implicit in the Terms of Service) + s11(1)(f) — legitimate interest",
    data: "Email address, name, message body (may contain arbitrary PII), attachment content, correspondence thread",
    recipients: "transactional email provider (inbound/outbound email handling), database and storage provider (if archived in-platform)",
    retention: "3 years from the date of the most recent correspondence, or indefinitely for threads that are part of an ongoing legal matter",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A10",
    slug: "audit_log",
    title: "Audit logging",
    description: "The audit_log table records every state-changing operation in Pleks — creation, update, deletion, and approval of records across the platform. Each row captures the actor, target, event type, timestamp, IP address, and change payload. The log is immutable — no UPDATE or DELETE policies exist on it.",
    lawfulBasis: "s11(1)(c) — compliance with law (POPIA s17 accountability; ECT Act s14 — electronic records as originals) + s11(1)(f) — legitimate interest (security monitoring and fraud prevention)",
    data: "Actor user ID, actor IP address, target entity identifiers, event type, before-and-after values of changed fields (may incidentally include PII), timestamp",
    recipients: "database and storage provider",
    retention: "7 years (SA business records retention and PPRA audit timelines) · subject-initiated erasure never removes audit_log rows",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "A11",
    slug: "product_analytics",
    title: "In-product analytics",
    description: "Understand how platform users navigate the product and which features they use. Currently not deployed — Pleks does not run a dedicated product-analytics tool on authenticated routes. This entry is recorded so that the absence of analytics is explicit rather than implicit.",
    lawfulBasis: "s11(1)(f) — legitimate interest (would apply when deployed, with balancing test documented)",
    data: "Currently none",
    recipients: "Currently none · any future deployment will trigger a DPIA and a register version bump",
    retention: "Not applicable",
    crossBorder: "Not applicable",
    notDeployed: true,
    notDeployedLabel: "Not deployed",
  },
  {
    id: "A12",
    slug: "platform_administration",
    title: "Platform administration and customer-success observability",
    description: "Cross-agency operational observability for Pleks platform administrators — the /admin/platform-health dashboard (revenue vs cost, cost outliers, inactive-org flags), /admin/trust-health (overdue trust closes, FFC expiry), and /admin/popia-requests (routing inbox for data-subject requests that reach Pleks directly). Pleks routes agency-data matters to the correct Responsible Party and never executes agency-data operations directly.",
    lawfulBasis: "s11(1)(f) — legitimate interest (understanding platform health is necessary to serve customers reliably; no agency personal data exposed in aggregate form)",
    data: "Organisation ID, name, agency FFC number and expiry, last-user-login timestamp, aggregated activity signals, cost attribution",
    recipients: "database and storage provider, transactional email provider (customer-success outreach)",
    retention: "Operational signals: 5 years from last activity (POPIA s14 — no longer than necessary) · account closure: purged after billing-record retention window expires (5 years)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },

  // ─── Part B — Pleks as Operator ────────────────────────────────────────────

  {
    id: "B1",
    slug: "property_portfolio",
    title: "Property portfolio management",
    description: "Record and maintain the agency’s property portfolio — properties, buildings, units, managing schemes, insurance, brokers, furnishings, inspection profiles, unit types, clause profiles. Supports the agency’s core property-management function.",
    lawfulBasis: "s11(1)(b) — contract (mandate agreement with landlord) + s11(1)(f) — legitimate interest (portfolio management is necessary for core business)",
    data: "Property address, landlord relationship, broker identity, managing scheme contact details, insurance broker and policy contact, emergency contact",
    recipients: "database and storage provider, the AI model provider (AI-assisted property setup when used — see B22)",
    retention: "Duration of agency mandate + 5 years post-termination",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs)",
  },
  {
    id: "B2",
    slug: "landlord_crm",
    title: "Landlord CRM and relationship management",
    description: "Maintain landlord profiles, contact details, bank details for statement payouts, relationship history, and communication preferences. Supports owner statements, communications, and the landlord portal.",
    lawfulBasis: "s11(1)(b) — contract (mandate agreement with landlord) + s11(1)(c) — compliance with law (PPRA disclosure and tax obligations)",
    data: "Name, ID number, date of birth, contact phone, contact email, addresses, bank account details (masked at rest, encrypted for operational use), marital status where relevant",
    recipients: "database and storage provider, transactional email provider (landlord communications), SMS and WhatsApp aggregator",
    retention: "Duration of mandate + 5 years post-termination (PPRA trust record retention)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B3",
    slug: "tenant_application",
    title: "Tenant application processing",
    description: <>
      <p>Accept rental applications from prospective tenants via the public /apply/[slug] portal. Capture form data, supporting documents (ID, proof of income, bank statements, employer letter), and consent records. Support the agency&rsquo;s shortlist-and-screen workflow. Also processes personal information of third parties named in the application: references, employer contacts, household members, emergency contacts.</p>
      <p><strong>Reference contacts as data subjects (<span className="act-pill">POPIA · S12</span> / <span className="act-pill">S18</span>).</strong> References named by an applicant are data subjects in their own right. Under s12 (collection directly from the data subject) and s18 (notification), references must be informed that their personal information has been collected and for what purpose. ToS §09.1 contractually requires the agency to send a s18 notice to each reference at the point of first contact — stating that they have been named as a reference for a rental application, what information will be requested from them, how long it will be retained, and how to exercise their rights. Pleks provides a template s18 notice that agencies may use. Compliance with this obligation is auditable via the communication log.</p>
      <p><strong>Children&rsquo;s personal information (POPIA s34–s35).</strong> Applications routinely include dependent details and household members who are minors. Under POPIA s34, processing a child&rsquo;s personal information requires consent from a competent person (parent or legal guardian). By submitting an application that includes dependent or household-member details for a person under 18, the applicant represents that they are the competent person within the meaning of s34 and are providing consent on behalf of that minor. Processing of minors&rsquo; information is limited strictly to housing-suitability necessity — establishing occupancy count and dependent-support obligations relevant to affordability. No credit check, identity verification, or marketing processing is performed against minor household members.</p>
    </>,
    lawfulBasis: "s11(1)(a) — consent (applicant submits the form and consents to processing for the specific application) + s11(1)(b) — pre-contractual steps at the data subject’s request",
    data: "Full name, ID number, DOB, contact phone/email, employment details, salary, dependent details, previous rental history, landlord/employer/character references, supporting documents",
    recipients: "database and storage provider, the payment gateway (application fee — B9), the credit bureau aggregator (credit check — B4), the AI model provider (income extraction — B22), e-signature provider (if application leads to lease signing)",
    retention: "Declined/withdrawn applications — raw screening data (identity documents, bank statements, income records, the credit bureau report, contact details, and the AI-generated narrative): 90 days from the terminal decision (automatic purge) · decision-accountability record (FitScore composite/band/per-dimension components, inputs hash, engine and interpretation versions, categorical decision-reason and adverse-factor codes, decision date/stage/deciding-agent identity, screening- and criminal-screening-policy versions, and the audit-log reference): up to 5 years from the terminal decision (POPIA s14(1)(b) — accountability and defence of legal rights); active legal holds suspend purge · Approved applications: absorbed into lease retention (5 years post-termination)",
    crossBorder: "Yes — SCCs (s72(1)(a)) for AI and hosting",
  },
  {
    id: "B4",
    slug: "credit_check_searchworx",
    title: "Credit checking (credit bureau aggregator)",
    description: <>
      <p>Obtain a credit bureau report on an applicant for the purpose of assessing tenancy suitability. The credit bureau aggregator (see §C) consolidates TransUnion, Experian, Compuscan, and XDS. A DPIA (Data Protection Impact Assessment) is in progress for this purpose and will be completed before the feature ships to production — credit data is among the highest-sensitivity personal information categories. No credit check is performed without explicit written consent under POPIA s11(1)(a), in compliance with the Credit Bureau Code of Conduct (issued under POPIA, October 2020) and the credit bureau aggregator&rsquo;s user agreement (see §C). The NCA s69 register of credit agreements does not provide the consent basis for bureau enquiries — that basis is POPIA s11(1)(a) alone.</p>
      <p><strong>Two-bundle architecture.</strong> Credit checks are offered in two bundles at the applicant&rsquo;s election: <strong>Standard (R250)</strong> — Searchworx standard report consolidating TransUnion, Experian, Compuscan, and XDS — and <strong>Estate (R650)</strong> — Searchworx standard report plus an enhanced Huru report (ITC Affordability Index and civil-judgement deep-dive) plus Compuscan. Huru operates as a sub-operator within the Searchworx operator chain for the Estate bundle (see §C). Commercial (juristic) applicants may elect modular pricing on a per-director basis — see B9 and B5.</p>
      <p><strong>Dual-output reports.</strong> Each check produces two outputs: a <strong>Consumer Report</strong> (PDF delivered to the applicant via a 7-day TTL signed URL under POPIA s18 transparency obligations — contains only the applicant&rsquo;s own credit data) and an <strong>Agent Report</strong> (structured credit result and FitScore inputs surfaced in the agent&rsquo;s applicant dashboard — not transmitted to the applicant). The Consumer Report is generated regardless of the check outcome.</p>
    </>,
    lawfulBasis: "s11(1)(a) — explicit consent (applicant consents to the specific purpose of a credit check before it is run; consent may be withdrawn for future checks but not to unwind a check already performed)",
    data: "Applicant ID number, full name, DOB, residential addresses (current and historical), employment history, credit history, default records, civil judgments, credit score, affordability result",
    recipients: "credit bureau aggregator — SA-domiciled, domestic processing (see §C); underlying bureaus via credit bureau aggregator; Huru (Estate bundle only — sub-operator via Searchworx, SA-domiciled); database and storage provider; AI model provider (FitScore generation — B5)",
    retention: "Declined / withdrawn applicants — raw bureau report: 90 days from pull date (automatic purge — matches the B3 raw-screening tier) · derived scoring outputs surviving in the B3/B5 decision-accountability record: up to 5 years (POPIA s14(1)(b)); active legal holds suspend purge · Approved applicants: 5 years post-lease-termination · consent log entry retained 10 years (POPIA s17 — Documentation)",
    crossBorder: "No for the credit check itself (credit bureau aggregator and SA credit bureaus are domestic) · Yes for derivative AI processing (FitScore via the AI model provider — SCCs)",
  },
  {
    id: "B5",
    slug: "fitscore",
    title: "FitScore generation and applicant comparison",
    description: <>
      <p>Generate a numeric affordability-and-suitability score for a rental applicant by combining credit check results (B4), verified income (B22 income extraction), rental history, and employment stability. Displayed to the agent alongside a human-readable rationale. FitScore is an assistive tool — it does not constitute an automated decision under POPIA s71. Final decisions are made solely by the agency or landlord.</p>
      <p><strong>Commercial composite FitScore.</strong> For juristic applicants (companies applying for commercial or semi-commercial tenancies), a commercial composite FitScore is generated by combining the company&rsquo;s credit result with individual FitScores for each named surety director. Each director generates a separate FitScore under their own individual B4 consent — the composite result reflects both entity-level creditworthiness and principal-level affordability. The number of surety directors is configurable per application.</p>
      <p>The agency isolation guarantee extends to FitScore data specifically: results are scoped to the originating agency at the point of computation and cannot be queried across org boundaries at any layer. See <a href="#fitscore-isolation">the four-layer enforcement structure</a> for how this isolation is verified at the database, application, computation, and integration levels.</p>
    </>,
    lawfulBasis: "Follows Purpose B4 — s11(1)(a) explicit consent (applicant consented to the credit check knowing results would inform a suitability assessment)",
    data: "Derivative of B4 (credit result) + declared income, verified income, rental history, employment information",
    recipients: "The AI model provider (FitScore rationale narrative generation — B22), database and storage provider",
    retention: "Two-tier for declined/withdrawn applicants — the FitScore inputs and source documents are purged with the raw screening data at 90 days; the structural FitScore outputs (composite, band, per-dimension components, inputs hash, and engine/interpretation/narrative-prompt versions) survive in the decision-accountability record for up to 5 years (POPIA s14(1)(b)); active legal holds suspend purge · Approved applicants: 5 years post-lease-termination",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs + s72(1)(b) consent basis)",
  },
  {
    id: "B6",
    slug: "lease_generation_signing",
    title: "Lease generation, signing, and document management",
    description: "Generate a lease document from the agency’s configured template + clause profile + unit-level overrides; render to PDF; route through the e-signature provider (see §C) for digital signing; store signed lease PDF and signatures. Covers lease creation, amendment, renewal, and termination document flows. ECT Act signature class note: standard residential lease agreements are validly signed with an ordinary electronic signature under ECT s13(1). Suretyship obligations under the General Law Amendment Act s6 are not covered by ECT s13 and may require an Advanced Electronic Signature or wet signature — agencies should seek legal advice before accepting a surety via the platform. This register does not constitute legal advice on signature validity.",
    lawfulBasis: "s11(1)(b) — contract (the lease is the contract) + s11(1)(c) — compliance with law (RHA s5 written lease requirements, CPA s14, ECT Act signature requirements)",
    data: "Full names, ID numbers, DOBs, contact details, employment details, signatures, co-tenant and landlord signatures, sureties if any",
    recipients: "database and storage provider, e-signature provider (self-hosted, same infrastructure as Pleks), transactional email provider (signing invitations), AI model provider (clause conflict checking — B22)",
    retention: "5 years post-termination (Prescription Act + PPRA mandate practice)",
    crossBorder: "Yes — SCCs (s72(1)(a)) and s72(1)(c) necessity for performance of contract",
  },
  {
    id: "B7",
    slug: "lease_lifecycle",
    title: "Lease lifecycle management",
    description: "Manage the lease over its full lifecycle — activation, escalation at anniversaries, CPA s14 auto-renewal notice (sent not more than 80 nor less than 40 business days before expiry, per CPA s14(2)(d)), notice acknowledgement, amendment (with audit trail), termination, move-out, and deposit reconciliation. Where the lease is not subject to the CPA (e.g., landlord not supplying services in the ordinary course of business), the contractual notice period specified in the lease applies instead.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA and CPA specific notice obligations). RHA commencement note: the written-lease requirement cites RHA s5 as amended by the Rental Housing Amendment Act 35 of 2014. Commencement of that Amendment has been irregular across provinces; agencies operating in provinces where the Amendment has not commenced should confirm the applicable statutory basis with their attorneys.",
    data: "Tenant contact details, lease state, notice history",
    recipients: "database and storage provider, transactional email provider and SMS and WhatsApp aggregator (notice delivery)",
    retention: "Follows Purpose B6 — 5 years post-termination",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B8",
    slug: "rent_invoicing_tracking",
    title: "Rent invoicing and payment tracking",
    description: "Generate monthly rent invoices and maintain the rent ledger per lease showing invoiced amounts, received amounts (matched from trust reconciliation — B12), and outstanding balances. Pleks does not execute rent collection under any payment rail — all money moves directly between the tenant’s and agency’s SA banks.",
    lawfulBasis: "s11(1)(b) — contract (the lease establishes the rent obligation) + s11(1)(c) — compliance with law (PPRA record-keeping, Tax Administration Act)",
    data: "Tenant name, lease identifier, rent amount, invoice history, payment receipt history. No tenant bank account numbers are stored by Pleks.",
    recipients: "database and storage provider",
    retention: "5 years post-lease-termination (PPRA record retention + Tax Administration Act s29)",
    crossBorder: "Yes — database and storage provider (SCCs)",
  },
  {
    id: "B9",
    slug: "application_fee_processing",
    title: "Application fee processing (payment gateway)",
    description: <>
      <p>Accept the applicant&rsquo;s rental application fee directly via the payment gateway (see §C). The fee is a Pleks-to-applicant service charge covering the cost of the underlying credit bureau report and Pleks&rsquo;s cost of operating the application-processing service. The agency receives no portion of any application fee under any tier or commercial arrangement.</p>
      <p><strong>Two-bundle pricing.</strong> <strong>Standard bundle (R250)</strong> — covers the Standard credit check, Consumer Report PDF delivery, and bank-statement income analysis (B22). <strong>Estate bundle (R650)</strong> — covers the Standard check plus enhanced Huru report (ITC Affordability Index and civil-judgement deep-dive), Consumer Report PDF delivery, and bank-statement income analysis. A standalone criminal-background check (B26), where elected, is priced at R330 per applicant and is processed as a separate payment. <strong>Commercial / juristic applicants</strong> are billed per director on a modular basis — each director&rsquo;s FitScore attracts the applicable per-applicant bundle fee.</p>
      <p><strong>Refund mechanics.</strong> Standard and Estate bundle fees are non-refundable once the Searchworx API call has been made. The criminal-background check fee (R330) is refundable if the Searchworx criminal-check API call has not yet been submitted; a 24-hour goodwill refund window applies post-submission for exceptional circumstances. Refund requests are logged in the consent log and actioned via the payment gateway reversal mechanism.</p>
    </>,
    lawfulBasis: "s11(1)(a) — consent (applicant initiates payment knowing the purpose) + s11(1)(b) — contract",
    data: "Applicant name, email, payment amount (R250 / R650 / R330 as applicable), transaction reference, bundle elected, payment method indicator (not full card number — payment gateway is the PCI boundary)",
    recipients: "payment gateway — SA-domiciled (see §C)",
    retention: "5 years (Tax Administration Act s29)",
    crossBorder: "No — payment gateway is SA-domiciled (domestic processing)",
  },
  {
    id: "B10",
    slug: "owner_statements",
    title: "Owner (landlord) statements",
    description: "Generate monthly statements for each landlord showing rent collected, deductions (management fees, maintenance, municipal, deposit transactions), and net payable. Deliver via email or landlord portal.",
    lawfulBasis: "s11(1)(b) — contract (mandate requires financial reporting) + s11(1)(c) — compliance with law (PPRA statement-of-account requirements)",
    data: "Landlord name, contact details, property portfolio breakdown, financial transaction data",
    recipients: "database and storage provider, transactional email provider (email delivery), AI model provider (welcome pack narrative — B22)",
    retention: "5 years from statement date (Tax Administration Act s29)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B11",
    slug: "rent_ledger_arrears",
    title: "Rent ledger, arrears, and letters of demand",
    description: "Maintain the rent ledger per lease, track arrears cases, and escalate arrears through a graduated sequence — informal reminder → formal reminder → letter of demand → final notice before cancellation. Record payment arrangements and resolve cases.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (formal demand requirements, RHA s4B) + s11(1)(f) — legitimate interest (protecting landlord’s income)",
    data: "Tenant contact details, payment history, arrears amount, communications sent, arrears case state",
    recipients: "database and storage provider, transactional email provider and SMS and WhatsApp aggregator (communication delivery), AI model provider (LOD text generation — B22)",
    retention: "5 years post-termination (Prescription Act + PPRA + Tribunal evidentiary practice)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B12",
    slug: "trust_reconciliation",
    title: "Trust account reconciliation",
    description: "Monthly reconciliation of the agency’s Section 86 trust account. Bank statement import (OFX/CSV/QIF), matching rent receipts against ledger entries, verification of disbursements, three-balance comparison, and sign-off. Produces an PPRA-compliant audit export (PDF + XLSX) with SHA-256 manifest hash for tamper-evidence.",
    lawfulBasis: "s11(1)(c) — compliance with law (Property Practitioners Act s54, PPA Regulation 33 — 5 years from the end of the financial year, PPRA audit requirements, Tax Administration Act s29)",
    data: "Tenant names on trust transactions, landlord and supplier names on disbursements, transaction amounts, payment references, dates, bank statement narrative text, masked bank account numbers (encrypted at rest)",
    recipients: "database and storage provider, AI model provider (variance explanation narrative — B22)",
    retention: "5 years (PPRA trust record retention + Tax Administration Act s29)",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs) · bank data import is local file upload (no cross-border transfer component)",
  },
  {
    id: "B13",
    slug: "deposit_management",
    title: "Deposit management",
    description: "Record deposit receipts, accrue interest (prime-linked, fixed, repo-linked, or manual), generate interest statements, handle deposit deductions at move-out (wear-and-tear vs damage classification with per-item justification), and issue itemised deduction schedule within 21 days per Rental Housing Act s5(7).",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (Rental Housing Act s5 deposit rules, PPRA trust account rules)",
    data: "Tenant name, deposit amount, interest accrued, deduction history with per-item details, photos of damage claimed, wear-and-tear assessments",
    recipients: "database and storage provider (including photo storage), transactional email provider (statement delivery), AI model provider (deduction justification narrative — B22)",
    retention: "5 years post-termination (PPRA trust record retention)",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs)",
  },
  {
    id: "B14",
    slug: "inspection_management",
    title: "Inspection management",
    description: "Schedule and conduct property inspections (move-in, periodic, move-out). Capture condition per room and per item. Preserve photo EXIF data (GPS and timestamp) for Tribunal evidentiary purposes. Generate inspection PDF with agent and tenant signatures. Photo protocol: agents must not photograph identifiable persons (including children present at inspection). Where a person is inadvertently captured, the image must be blurred or cropped to remove the identifiable person before upload and storage. Agents are notified of this requirement within the inspection workflow. Photos of tenant belongings or personal effects visible in the property are retained only where necessary to document condition relevant to deposit deductions.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (Rental Housing Act inspection requirements)",
    data: "Tenant name and signature, agent name and signature, property address, photos of the property interior and exterior (EXIF GPS and timestamp preserved; may incidentally include tenant belongings or persons)",
    recipients: "database and storage provider, AI model provider (wear-and-tear assessment — B22)",
    retention: "3 years post-termination · 5 years if a Tribunal dispute arises within the retention window",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs)",
  },
  {
    id: "B15",
    slug: "maintenance_management",
    title: "Maintenance management",
    description: "Accept maintenance requests from tenants (via portal, WhatsApp, or SMS), AI-triage for severity and category, assign to contractors, track progress, record completion, split costs between landlord / tenant / other parties, and handle delays and contractor communication.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA s4B habitability duty)",
    data: "Tenant name and contact details, description of the issue, photos of the issue, contractor assignment, cost allocation",
    recipients: "database and storage provider, SMS and WhatsApp aggregator (contractor notifications), AI model provider (maintenance triage — B22), transactional email provider (email notifications)",
    retention: "3 years post-completion (Tribunal evidentiary practice)",
    crossBorder: "Yes — SCCs (s72(1)(a)) for AI, email, and SMS/WhatsApp routing (SMS and WhatsApp aggregator is Kenya-domiciled)",
  },
  {
    id: "B16",
    slug: "critical_incident",
    title: "Critical incident handling",
    description: "Handle high-severity maintenance incidents (fire, burst pipe, major break-in, geyser failure) with an expedited workflow. Notify broker (for insurable events), owner, and managing scheme in parallel. Record the incident and the decisions taken. Integrates with insurance claim preparation.",
    lawfulBasis: "s11(1)(c) — compliance with law (habitability duty; insurer disclosure obligations) + s11(1)(f) — legitimate interests of the Responsible Party and the insurer as affected third party (s11(1)(e), which applies to public bodies, does not apply here)",
    data: "As B15 plus insurance broker and policy contact details, owner notification preferences, scheme notification preferences",
    recipients: "database and storage provider, transactional email provider (broker and scheme notifications), SMS and WhatsApp aggregator (urgent contractor dispatch)",
    retention: "5 years (insurance claim evidence + Tribunal evidentiary practice)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B17",
    slug: "tenant_communications",
    title: "Tenant communications lifecycle",
    description: "The tenant-facing communication layer across the full tenancy — rent invoices, payment receipts, monthly statements, arrears escalation, lease lifecycle events, inspection reminders, maintenance updates, deposit events, portal invitations, retry cascades, and delivery tracking. WhatsApp-primary with SMS and email backup.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA and CPA mandatory notice obligations; mandatory comms bypass tenant opt-out preferences)",
    data: "Tenant name, contact phone, contact email, message body, delivery status, WhatsApp template variant used, communication preferences for non-mandatory comms",
    recipients: "SMS and WhatsApp aggregator (WhatsApp via WhatsApp Business Platform provider, SMS), transactional email provider, database and storage provider (full-body retention for Tribunal evidence)",
    retention: "5 years post-termination (aligned with trust records; Tax Administration Act support)",
    crossBorder: "Yes — WhatsApp Business Platform provider is US/IE; transactional email provider is US. SCCs (s72(1)(a))",
  },
  {
    id: "B18",
    slug: "supplier_management",
    title: "Supplier / contractor management",
    description: "Maintain the agency’s list of contractors and suppliers, their trade categories, FFC/PPRA status where applicable, contact details, job history, invoice submissions, and payments. Support the contractor portal for job communication and status updates.",
    lawfulBasis: "s11(1)(b) — contract (contractor mandate for specific jobs) + s11(1)(c) — compliance with law (agency duty to verify contractor legitimacy)",
    data: "Contractor name, contact details, trade, rates, FFC number if applicable, bank details for payment (encrypted), job history, invoice submissions",
    recipients: "database and storage provider, transactional email provider and SMS and WhatsApp aggregator (communications)",
    retention: "5 years from last engagement (Tax Administration Act s29)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B19",
    slug: "municipal_bill_processing",
    title: "Municipal bill processing",
    description: "Parse municipal bills (rates, water, electricity, refuse) via AI extraction when uploaded by the agent. Allocate charges across properties when the bill covers multiple units. Flag anomalies (sudden increases, unusual consumption). Support payment tracking.",
    lawfulBasis: "s11(1)(b) — contract (mandate to manage property expenses) + s11(1)(c) — compliance with law (PPRA property-management record keeping)",
    data: "Property address, account holder (usually the landlord), municipal account number, consumption and charge data",
    recipients: "database and storage provider, AI model provider (bill extraction — B22)",
    retention: "5 years (Tax Administration Act s29)",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs)",
  },
  {
    id: "B20",
    slug: "hoa_scheme_management",
    title: "HOA / Body Corporate / Managing Scheme",
    description: "For properties in a Homeowners Association or Body Corporate, manage levy schedules, AGM documents, reserve fund contributions, levy arrears, and scheme contact details.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (Sectional Titles Schemes Management Act)",
    data: "Scheme contact details, levy payment history per owner, AGM attendance and voting records where relevant",
    recipients: "database and storage provider, transactional email provider (AGM and levy communications), AI model provider (AGM notice drafting — B22)",
    retention: "5 years (STSMA and tax retention) · AGM records per scheme bylaws (indefinite in most cases)",
    crossBorder: "Yes — AI processing via the AI model provider (SCCs)",
  },
  {
    id: "B21",
    slug: "document_generation",
    title: "Document generation and storage",
    description: "Generate, store, and deliver documents that combine data from multiple Part B purposes — welcome packs for new tenants, landlord reports, property rules documents, inspection certificates, arrears bundles, and compliance packs for Tribunal proceedings.",
    lawfulBasis: "s11(1)(b) — contract + s11(1)(c) — compliance with law (varies by document type; follows the source purpose)",
    data: "Names, contact details, financial data, and other personal information drawn from source purposes; AI-generated narrative text",
    recipients: "database and storage provider, transactional email provider (document delivery), AI model provider (narrative generation — B22)",
    retention: "Follows the source data (typically 5 years post-termination for lease records)",
    crossBorder: "Yes — SCCs (s72(1)(a))",
  },
  {
    id: "B22",
    slug: "ai_assisted_processing",
    title: "AI-assisted processing",
    description: <>
      <p>Bounded, assistive AI processing across multiple workflows — income extraction and classification from bank statements, FitScore rationale, maintenance triage, deposit deduction justification, lease clause conflict checking, arrears letter drafting, wear-and-tear assessment, municipal bill extraction, AGM notice drafting, trust audit narrative, and criminal-background check result summarisation (B26 sub-purpose). AI processing is assistive only: Pleks does not make automated decisions about tenants or applicants. All decisions remain with the agency or landlord. Prompts and responses are not retained — the AI model provider (see §C) operates under a zero-retention Enterprise DPA. PII minimisation is applied before cross-border transfer: prompts contain structured context values (amounts, dates, categories) and exclude direct identifiers (name, ID number, contact details) where the task does not require them. This minimisation reduces but does not eliminate identifiability — structured context (property address, exact rent, exact arrears, dates) may remain reasonably linkable to an individual and constitutes pseudonymised, not anonymised, personal information under POPIA s1. All cross-border AI transfers therefore remain personal information transfers and are governed by SCCs under POPIA s72(1)(a). The agency remains solely responsible for ensuring deductions comply with the Rental Housing Act and applicable Tribunal standards. Agencies are expected to review AI-generated outputs for accuracy, fairness, and contextual appropriateness before relying on them operationally.</p>
      <p><strong>Bank statement income and classification.</strong> A single Sonnet call performs six simultaneous analyses on each uploaded bank statement: (1) identity match — name on statement against applicant ID document; (2) statement-quality validation — detects missing months, unexplained gaps, account closures, and statement-period truncation; (3) 13-category recurring-debit classification — rent, vehicle finance, insurance, telco, streaming, gym, maintenance levies / HOA, school fees, medical aid, loan repayments, food / utilities, gambling / FICA-flag items, and other; (4) declared-rent fuzzy match — validates the amount the applicant claims to pay in rent against actual debit entries; (5) Pleks invoice-reference detection — identifies whether invoices from Pleks-managed properties appear as expected in the statement; (6) income-reasonableness check — flags implausible declared income against visible credits. The classified output feeds the B5 FitScore affordability model and is included in the B4 Agent Report. Under POPIA s71 this output is advisory — no automated decision is made on the basis of bank statement classification alone.</p>
    </>,
    lawfulBasis: "Multiple — follows the lawful basis of the sub-purpose (e.g., B4 consent for FitScore, B7 contract for lease clause checking)",
    data: "Structured context specific to the sub-purpose only. Direct identifiers (name, ID number, contact details) are stripped where not required by the task. No prompt text or response text retained by Pleks or the AI model provider.",
    recipients: "AI model provider — see §C (zero-retention Enterprise DPA + SCCs)",
    retention: "No retention — zero-retention DPA with the AI model provider (see §C); derivative outputs follow the source purpose’s retention period",
    crossBorder: "Yes — AI model provider (see §C) is US-based. SCCs (s72(1)(a)) + zero-retention Enterprise DPA",
  },
  {
    id: "B23",
    slug: "popia_subject_requests",
    title: "POPIA data-subject request handling",
    description: "Process data-subject requests — access (s23), correction (s24), deletion (s25), objection (s11(3)), restriction, and portability — received via the in-platform subject-rights dashboard or direct contact. For Part B requests, Pleks routes to the correct agency (Responsible Party) and supports the agency’s 30-day response window. For Part A requests, Pleks responds directly.",
    lawfulBasis: "s11(1)(c) — compliance with law (POPIA Chapter 5 and Chapter 10 obligations)",
    data: "Data subject identity, request type, correspondence, resolution decision, consent log entries, audit trail of request processing",
    recipients: "database and storage provider, transactional email provider (response communications)",
    retention: "10 years (POPIA accountability obligations; audit trail of rights exercises)",
    crossBorder: "Yes — database and storage provider (SCCs)",
  },
  {
    id: "B24",
    slug: "fica_kyc_storage",
    title: "FICA / KYC documentation storage",
    description: "Store FICA / KYC documentation for agencies that are Accountable Institutions under the Financial Intelligence Centre Act — copies of founding documents, director ID documents, proof of address, tax numbers. Supports the agency’s own FICA compliance obligations.",
    lawfulBasis: "s11(1)(c) — compliance with law (Financial Intelligence Centre Act s22/s23 record-keeping obligations for Accountable Institutions)",
    data: "Name, ID number, proof of address, banking details, SARS tax number — all stored encrypted at rest via the database and storage provider (see §C)",
    recipients: "database and storage provider (encrypted)",
    retention: "5 years post-termination of business relationship (FICA s23 record-keeping obligation)",
    crossBorder: "Yes — database and storage provider (SCCs)",
  },
  {
    id: "B25",
    slug: "agency_direct_marketing",
    title: "Agency-originated direct marketing to tenants and landlords",
    description: "Reserved placeholder for a future capability that would allow agencies to send opted-in marketing communications (e.g., property listings, market commentary) to their own tenant or landlord contacts via the Pleks platform. Not currently deployed. Any deployment will require a new consent basis, a register version bump, and re-consent notification per the maintenance discipline.",
    lawfulBasis: "s11(1)(a) — explicit consent (would be required before any deployment)",
    data: "Currently none",
    recipients: "Currently none · any deployment requires DPIA and register version bump",
    retention: "Not applicable",
    crossBorder: "Not applicable",
    notDeployed: true,
    notDeployedLabel: "Reserved — not deployed",
  },
  {
    id: "B26",
    slug: "criminal_behaviour_screening",
    title: "Criminal-background screening",
    description: <>
      <p>Obtain a criminal-background check on a rental applicant under <span className="act-pill">POPIA · S27(1)(a)</span> — special information processing is permissible where it is necessary for the establishment, exercise, or defence of a right or obligation in law, specifically the agency&rsquo;s duty of care to existing tenants, household members, and the community (Rental Housing Act s4(5) — general obligations of landlords; common-law neighbour liability). <strong>Lawful basis: s27(1)(a) only.</strong> The s27(2)(a) consent exception does not apply — it is reserved for processing mandated by specific legislation; a voluntary tenancy-screening check is not legislatively mandated. The s27(2)(c) public-interest exception does not apply — individual tenancy screening is not public-interest research in the POPIA s27(2)(c) sense. s27(1)(a) is the sole basis and applies only where the agency can document a genuine duty-of-care basis for the check. A Data Protection Impact Assessment has been conducted for this processing in accordance with POPIA s17 accountability obligations and Information Regulator Guidance Note 4 (2024). The DPIA is available on request to the Information Officer via the data-subject request pathway.</p>
      <p><strong>Consent mechanics.</strong> Criminal-background checks require a separate, standalone consent — visually distinct from the standard credit-check consent (amber-bordered, clearly labelled as &ldquo;consent to criminal-background check under POPIA s27&rdquo;). The applicant must separately and affirmatively consent; consent cannot be bundled with the credit-check consent. An applicant who refuses this consent must not be refused tenancy on that ground alone — agencies are notified of this constraint in the workflow. Consent may be withdrawn before the Searchworx API call is made; once submitted, withdrawal does not unwind a completed check.</p>
      <p><strong>AI constraints under POPIA s71.</strong> The Sonnet model used to summarise criminal-check results (B22 sub-purpose) is constrained to factual output only: confirmed convictions, pending cases, and result classification. The model must not editorialise, draw inferences about character, or apply weightings beyond what the raw record states. Criminal-record information is processed in a dedicated prompt isolated from other applicant data — it must not be combined with income, credit, or rental-history context in the same call. Output is surfaced in the Agent Report only — not included in the Consumer Report delivered to the applicant.</p>
    </>,
    lawfulBasis: "s27(1)(a) — necessary for the establishment, exercise, or defence of a right or obligation in law (agency duty of care to existing tenants and household members)",
    data: "Applicant full name, ID number, DOB; criminal record extract (convictions, pending cases, result classification); consent log entry",
    recipients: "credit bureau aggregator (Searchworx — criminal check submission, SA-domiciled); database and storage provider (restricted storage — agent-read-only RLS, no tenant or applicant self-service access); AI model provider (result summarisation — B22 sub-purpose)",
    retention: "7 days from date of check if applicant withdraws or application is rejected (automatic purge of the raw criminal-record extract — the special information itself) · 30 days post-lease-activation if applicant is accepted · the categorical screening-outcome code (not the underlying record) may persist as an adverse-factor code in the B3/B5 decision-accountability record for up to 5 years where it informed a decline, alongside the criminal-screening-policy version (POPIA s14(1)(b)) · consent log entry retained 10 years (POPIA s17)",
    crossBorder: "No for the criminal check itself (Searchworx and underlying sources are SA-domiciled, domestic processing) · Yes for AI result summarisation (AI model provider — SCCs under s72(1)(a))",
    dpia: "Completed — conducted in accordance with POPIA s17 accountability obligations and Information Regulator Guidance Note 4 (2024). Available on request to the Information Officer via the data-subject request pathway.",
  },
  {
    id: "B27",
    slug: "property_intelligence",
    title: "Property and landlord verification (property-intelligence)",
    description: <>
      <p>Pull public-register information about properties and landlords to verify mandate legitimacy and support property valuation decisions. Three product families: (1) <strong>Deeds Office searches</strong> — confirming the registered owner of a property matches the person presenting themselves as the landlord at mandate-taking; (2) <strong>Lightstone Erf Valuation Short</strong> — indicative property market value for owner pitches, FFC due diligence, and insurance value confirmation; (3) <strong>CIPC Company and Director lookups</strong> — verifying that juristic landlords exist, are in good standing, and that the natural persons claiming to act for them are listed as directors. CIPC Director pulls are limited to first-layer corporate ownership — directors of the named juristic landlord only. Beneficial-ownership chains beyond the first layer constitute a distinct processing purpose with their own balancing test and are out of scope here.</p>
      <p><strong>Lawful basis — nature of data matters.</strong> For Deeds Office and CIPC pulls (which surface personal information about landlords and directors): <span className="act-pill">POPIA · S11(1)(c)</span> compliance with law — including mandate-taking and due-diligence obligations under the Property Practitioners Act, its Regulations, and the PPRA Code of Conduct — stacked with <span className="act-pill">POPIA · S11(1)(f)</span> legitimate interest — agency-side mandate-fraud prevention and protection of the genuine landlord&rsquo;s interests against impersonators. The balancing test under s11(1)(f) favours processing: the data subjects&rsquo; privacy interests are minimally impacted because the Deeds Office and CIPC are statutorily public registers accessible to any member of the public. For Lightstone Erf Valuation Short in isolation: POPIA does not apply — the return values are property-domain only (no natural-person data subject). Where valuation data is stored alongside Deeds-pulled owner identity data, the combined record is personal information and falls under the Deeds Office analysis above — this prevents a &ldquo;no POPIA&rdquo; framing from being misread as a categorical exemption for the combined record.</p>
      <p><strong>Distinction from Purpose B4 (credit screening).</strong> B27 is structurally distinct from B4 despite both using Searchworx as aggregator. (1) <em>Lawful basis</em>: B4 is <span className="act-pill">POPIA · S11(1)(a)</span> explicit consent — the applicant actively consents to a credit check; B27 stacks s11(1)(c) compliance with law and s11(1)(f) legitimate interest because the data subjects are landlords and directors whose information is in public registers and the agency has a statutory mandate-due-diligence obligation — consent is neither required nor appropriate. (2) <em>Data classification</em>: B4 surfaces credit-bureau data (privacy-sensitive even where lawful); B27 surfaces public-register data (statutorily accessible). (3) <em>Retention</em>: B4 applies POPIA minimisation against credit data (12 months); B27 follows PPA s54 + Regulation 33 mandate-records retention (5 years from end of mandate, or longer where the record supports an audit trail). Conflating B27 with B4 produces incorrect retention enforcement and an incorrect consent posture.</p>
      <p><strong>Safeguards.</strong> ID numbers from Deeds Office and CIPC Director pulls are stored encrypted at the column level and masked in all display surfaces (last four digits by default; full disclosure gated behind an explicit action and audit-logged) — matching the §03 safeguards pattern applied to FICA records (B24) and credit-screening records (B4). <strong>Prior-owner data disposition:</strong> where prior-owner data appears incidentally in a deed-history response, it is retained in the raw vendor-response audit payload but not surfaced in the agency UI, not parsed into operational extracted fields, and not used for any operational purpose. <strong><span className="act-pill">POPIA · S18</span> notification posture:</strong> individual s18 notification is not provided to incidental data subjects (first-layer directors and prior owners surfaced in vendor responses). Reliance is placed on the s18(4) notification exceptions — the personal information is derived from a statutory public register; notification would prejudice a lawful fraud-prevention purpose; notification is not reasonably practicable given the manner and source of collection. Operationally engaged directors receive notification through the agency relationship itself per standard s18 practice.</p>
    </>,
    lawfulBasis: "Deeds Office + CIPC pulls: s11(1)(c) — compliance with law (Property Practitioners Act s54, PPA Regulations, PPRA Code of Conduct mandate-taking obligations) stacked with s11(1)(f) — legitimate interest (mandate-fraud prevention; protection of genuine landlord’s interests) · Lightstone Erf Valuation Short in isolation: POPIA inapplicable (property-domain data only, no natural-person data subject); combined record with Deeds-pulled owner data falls under the s11(1)(c)/(f) analysis above",
    data: "Deeds Office: registered owner name, ID number, purchase date, purchase price, deed number, title deed reference, transfer date · CIPC Company: registered name, registration number, status, registered address, business start date · CIPC Director (first-layer only): director name, ID number, appointment date, status, position · Lightstone: estimated property value, value-band low/high, confidence indicator, last-sale date and price (no personal information in isolation)",
    recipients: "Searchworx (credit bureau aggregator — see §C; B27 accesses Deeds Office, CIPC, and Lightstone product families via the same Searchworx vendor relationship as B4); Lightstone (commercial property-data vendor; sub-Operator to Searchworx for the valuation product family — Lightstone POPIA compliance incorporated by reference into the Pleks/Searchworx commercial agreement per POPIA s21(2)); database and storage provider; payment gateway (per-pull transaction processing)",
    retention: "Deeds Office and CIPC pulls: 5 years from end of mandate (Property Practitioners Act s54 + Regulation 33; PPRA mandate-record practice) — where the pull supports an audit-trail record, the longer 7-year period applies (POPIA s17 + Companies Act s24) · Lightstone valuations: operational life of associated property record; where combined with Deeds-pulled owner data, follows the longer applicable retention period · Pulls are permanent operational records — re-pulls create new rows without overwriting prior ones (preserving the “agency verified ownership at date X” audit lineage)",
    crossBorder: "No for source data — Searchworx, Deeds Office of South Africa, CIPC, and Lightstone all operate domestically (domestic processing; no SCCs required for source pulls) · Yes for storage and hosting downstream (database and storage provider, application hosting — SCCs under s72(1)(a))",
    dpia: "Not required (statutory) — established legitimate-interest processing of public-register data; no s26 special-information categories; no automated decision-making producing legal or similarly significant effects; narrow purpose; low data-subject impact · Informal DPIA planned before B27 reaches general availability across all tiers (or Q3 2026 at latest) to strengthen the s11(1)(f) balancing-test documentation — not a precondition for early-access availability",
  },
] as const
