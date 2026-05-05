/**
 * app/(public)/privacy/processing-purposes/page.tsx — POPIA processing-purpose register
 *
 * Route:  /privacy/processing-purposes
 * Auth:   public
 * Notes:  Standalone register — no doc-switcher links shown in sidenav.
 *         Covers Part A (12 Pleks-RP purposes) and Part B (25 Operator purposes).
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"

export const metadata: Metadata = {
  title: "Processing Register — Pleks",
  description: "Pleks's POPIA s17 processing-purpose register — all platform and operator purposes, lawful bases, data categories, retention periods, and operators directory.",
}

const SECTIONS = [
  { id: "about",       num: "00", label: "About this register" },
  { id: "controllers", num: "01", label: "Controllers"         },
  { id: "officer",     num: "02", label: "Information officer" },
  { id: "security",    num: "03", label: "Security safeguards" },
  { id: "part-a",      num: "A·", label: "Platform purposes"  },
  { id: "part-b",      num: "B·", label: "Operator purposes"  },
  { id: "operators",   num: "C·", label: "Operators directory" },
]

export default function ProcessingRegisterPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["POPIA · S17 · S18", "processing register", "v2026.1"]}
      titleBefore="Processing"
      titleHighlight="register"
      subtitle="Pleks's POPIA processing-purpose register — all 12 platform purposes and 25 operator purposes, with lawful bases, data categories, retention periods, and the full operators directory."
      kicker={[
        { label: "Last reviewed", value: "2026 · 04 · 20", mono: true },
        { label: "In force from",  value: "2026 · 05 · 01", mono: true },
        { label: "Version",        value: "v2026.1",         mono: true },
        { label: "Standard",       value: "POPIA s17 · s18"              },
      ]}
      sections={SECTIONS}
      hasSummary
      showDocLinks={false}
      endLabel="END · PROCESSING REGISTER · v2026.1"
    >
      {/* Summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this register covers</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>Pleks operates in two roles: as <strong>Responsible Party</strong> for 12 platform purposes (authentication, billing, support — Part A) and as <strong>Operator</strong> for 25 agency-side purposes (tenant data, leases, inspections — Part B).</span></li>
          <li><span className="b" /><span>For Part B data, the <strong>agency is the Responsible Party</strong>. Data-subject requests about tenant or lease records must be directed to the agency, not to Pleks.</span></li>
          <li><span className="b" /><span>Credit checks (B4) require the applicant&rsquo;s <strong>explicit consent</strong> under both <span className="act-pill">POPIA · S11</span> and <span className="act-pill">NCA · S69</span> before any bureau query is submitted.</span></li>
          <li><span className="b" /><span>AI processing (B22) is <strong>assistive only</strong>. Pleks does not make automated decisions about tenants or applicants — all decisions remain with the agency or landlord.</span></li>
          <li><span className="b" /><span>All cross-border transfers to US/international vendors are governed by Standard Contractual Clauses under <span className="act-pill">POPIA · S72(1)(a)</span>.</span></li>
        </ul>
      </div>

      {/* 00 — About */}
      <section id="about">
        <p className="sec-num"><span className="bar" /><span>00 · Background</span></p>
        <h2 className="sec-h">About this <span className="hl">register</span></h2>
        <p>
          This document is Pleks&rsquo;s processing-purpose register under <span className="act-pill">POPIA · S17</span> (accountability
          principle — Responsible Party must have measures in place to ensure compliance) and <span className="act-pill">POPIA · S18</span>
          (notification to data subjects of processing purposes). It is published publicly because public accountability is stronger than
          private accountability, and because agencies evaluating Pleks for procurement have a legitimate need to review exactly what the
          platform does with personal information before they commit.
        </p>
        <p>
          <strong>If you are an agency or property practitioner using Pleks:</strong> under POPIA you are the <strong>Responsible
          Party</strong> for every natural person whose personal information you collect — tenants, applicants, landlords, contractors,
          references, household members. Pleks is your <strong>Operator</strong>, processing data on your behalf under the Pleks Operator
          Agreement. This document describes what Pleks does as your Operator; your own register must describe what your agency does,
          with Pleks listed as one of your Operators.
        </p>
        <p>
          <strong>If you are a data subject</strong> (tenant, applicant, landlord, supplier): this document tells you what the platform
          does and who the actors are. For Part B data, your rights under POPIA are exercised against the agency — the Responsible Party
          for that data. For Part A data (your Pleks account), your rights are exercised against Pleks directly.
        </p>
        <p>
          Purposes prefixed <strong>A</strong> are Pleks as Responsible Party. Purposes prefixed <strong>B</strong> are Pleks as
          Operator for agencies. This distinction is preserved throughout the register and is load-bearing for all data-subject rights
          and accountability obligations.
        </p>
      </section>

      {/* 01 — Controllers */}
      <section id="controllers">
        <p className="sec-num"><span className="bar" /><span>01 · Roles</span></p>
        <h2 className="sec-h"><span className="hl">Controllers</span></h2>
        <p>
          Pleks&rsquo;s processing activities fall into two distinct controller relationships:
        </p>
        <p>
          <strong>Pleks as Responsible Party (Part A)</strong> — for data arising from the platform itself: authentication, security
          telemetry, error monitoring, product feedback, uptime probes, cost observability, billing, marketing, and support communications.
          Pleks is the sole decision-maker about this processing and is accountable under POPIA for it.
        </p>
        <p>
          <strong>Pleks as Operator (Part B)</strong> — for data arising from agency use of the platform: tenant profiles, leases,
          inspections, maintenance, communications, trust transactions, deposits, applications, credit checks, owner statements, and every
          other artefact of property management. The agency is the Responsible Party; Pleks processes this data on the agency&rsquo;s
          behalf under the Pleks Operator Agreement, which incorporates the mandatory written-contract terms required by{" "}
          <span className="act-pill">POPIA · S20</span> and <span className="act-pill">POPIA · S21</span>.
        </p>
        <p>
          <strong>Sovereign-trust invariant.</strong> Pleks holds no client funds. Client funds reside in the agency&rsquo;s own
          Section 86 trust account at the agency&rsquo;s own bank. Pleks does not initiate payments and is not the trustee. This
          is the financial expression of the same principle: Pleks is an Operator, not a custodian.
        </p>
        <p>
          <strong>Mixed-role processing.</strong> Purpose B9 (application fee processing) and all Part A observability purposes operate
          at the Pleks-RP layer even where initiated within an agency workflow. These are structurally separated from Part B processing
          and are listed under their correct controller in this register.
        </p>
      </section>

      {/* 02 — Information officer */}
      <section id="officer">
        <p className="sec-num"><span className="bar" /><span>02 · Officers</span></p>
        <h2 className="sec-h">Information <span className="hl">officer</span></h2>
        <p>
          The Information Officer for Pleks-RP purposes (Part A) is named below. For Part B purposes, the Information Officer is
          the agency&rsquo;s own — not Pleks&rsquo;s. Agencies set their Information Officer details at{" "}
          <code>/settings/privacy/information-officer</code>.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer<br />(Part A)</span>
          <span className="v">
            Stéan Bouwer · Pleks (Pty) Ltd
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
        <div className="officer-card">
          <span className="l">Information<br />Regulator</span>
          <span className="v">
            Information Regulator of South Africa
            <span className="sub">
              JD House, 27 Stiemens Street, Braamfontein, 2001 ·{" "}
              <a href="https://inforeg.org.za" target="_blank" rel="noopener noreferrer">inforeg.org.za</a>
              {" "}· 010 023 5207
            </span>
          </span>
        </div>
        <p>
          Every data subject has the unconditional right to complain to the Information Regulator independently of Pleks or the
          agency&rsquo;s response. The Regulator&rsquo;s contact details are surfaced on every data-subject-rights interface in the platform.
        </p>
      </section>

      {/* 03 — Security */}
      <section id="security">
        <p className="sec-num"><span className="bar" /><span>03 · Safeguards</span></p>
        <h2 className="sec-h">Security <span className="hl">safeguards</span></h2>
        <p>
          Pleks implements appropriate technical and organisational measures consistent with <span className="act-pill">POPIA · S19</span>:
        </p>
        <ul className="legal-list">
          <li><strong>Encryption in transit:</strong> TLS 1.2+ for all connections; HSTS enforced; no plaintext fallback.</li>
          <li><strong>Encryption at rest:</strong> AES-256 at the database layer via Supabase; sensitive fields (bank account numbers, TOTP secrets, passkey credentials) additionally encrypted at the column level.</li>
          <li><strong>Row-Level Security:</strong> Postgres RLS enforced on every table carrying personal information; service-role access restricted to server-side only with org-scoped gateway helper; no broad-access admin views.</li>
          <li><strong>Authentication:</strong> magic-link auth for tenant/landlord/supplier roles; password + mandatory MFA for agent roles; MFA step-up required for fiduciary-class actions.</li>
          <li><strong>Immutable audit logging:</strong> every state-changing operation recorded in <code>audit_log</code> with actor, target, event type, timestamp, and change payload; no UPDATE or DELETE policies on the log.</li>
          <li><strong>PII scrubbing for observability:</strong> error monitoring and log aggregation tools receive PII-scrubbed events only; scrubber runs pre-transmission and strips request bodies from sensitive routes and PII patterns from all payloads.</li>
          <li><strong>Signed URLs with TTL:</strong> all sensitive downloads use time-limited signed URLs; no public bucket access to customer data.</li>
          <li><strong>Operator contractual controls:</strong> every third-party Operator operates under a Data Processing Addendum with SCCs where cross-border, and documented retention and breach-notification terms.</li>
        </ul>
        <p>
          Where multiple retention periods apply to the same record, Pleks enforces the longest applicable statutory, contractual, or
          evidentiary period. Purpose-level retention periods in this register are minimum commitments and may be overridden by mandatory
          statutory retention (Tax Administration Act s29 — 5 years; PPRA trust records; FIC Act s23 — 5 years; Companies Act), active
          legal holds, subject-request restrictions, ongoing disputes, or subpoenas.
        </p>
      </section>

      {/* Part A */}
      <section id="part-a">
        <p className="sec-num"><span className="bar" /><span>A · Pleks as Responsible Party</span></p>
        <h2 className="sec-h">Platform <span className="hl">purposes</span></h2>
        <p>
          These 12 purposes are those for which Pleks itself is the Responsible Party. The lawful basis for each is normally either
          performance of the contract between Pleks and the platform user (the Terms of Service, <span className="act-pill">POPIA · S11(1)(b)</span>),
          or Pleks&rsquo;s legitimate interest in operating a reliable and secure service (<span className="act-pill">POPIA · S11(1)(f)</span>),
          with appropriate balancing against the data subject&rsquo;s interests.
        </p>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A1</span>
            <span>Platform authentication</span>
            <code className="purpose-slug">platform_authentication</code>
          </div>
          <p className="purpose-desc">Allow users (agents, tenants, landlords, suppliers, applicants) to sign in and maintain an authenticated session. Covers email/password, magic-link, session cookie issuance, expiry, and logout.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — performance of contract (Terms of Service)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">email address, password hash (bcrypt), session tokens, IP address, user agent, authentication event timestamps</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (auth backend), Resend (magic-link and new-device notification emails)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Sessions: 30 days after expiry · Auth events: 7 years · Account records: purged 30 days after account closure</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A2</span>
            <span>Multi-factor authentication</span>
            <code className="purpose-slug">mfa_totp_passkeys</code>
          </div>
          <p className="purpose-desc">Enforce MFA for agent accounts (mandatory) and offer optional MFA for tenant/landlord/supplier accounts. Includes TOTP enrolment via authenticator app, passkey (WebAuthn) registration, and step-up challenges for fiduciary-class actions.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(d) — obligation imposed by law (POPIA s19 security safeguards)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">TOTP secret (encrypted), passkey credential ID, passkey public key, credential counter, device name, enrolment timestamps, IP at enrolment</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (enrolment/unenrolment notifications)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">7 years alongside auth events · revoked passkey records purged after 30 days</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A3</span>
            <span>Error monitoring and exception tracking</span>
            <code className="purpose-slug">error_monitoring</code>
          </div>
          <p className="purpose-desc">Capture unhandled exceptions and server/client-side errors to detect and fix defects. Every event routed through a POPIA-safe scrubber that removes request bodies from sensitive routes and strips known PII patterns from all payloads before transmission to Sentry.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(f) — legitimate interest (detection and remediation of platform defects is necessary for a reliable service)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">User ID (UUID), organisation ID, role, release version, error type, stack trace, route path (query parameters stripped). No email, name, phone, IP, request body, or session cookie.</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Sentry (US-based — see Appendix A3)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">90 days at Sentry (Sentry default) · Pleks does not retain error events independently</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) + PII scrubber removes personal information at source</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A4</span>
            <span>In-product user feedback</span>
            <code className="purpose-slug">user_feedback</code>
          </div>
          <p className="purpose-desc">Capture free-text feedback, bug reports, and feature requests via the floating feedback button on authenticated layouts. Support reply-by-email. Used to prioritise product development.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — consent (user explicitly initiates submission) + s11(1)(b) — contract (responding to user queries)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">User ID, organisation ID, role, feedback category, free-text body (may contain PII the user chooses to include), submission URL, user agent, release version</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (reply delivery)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Indefinite for non-deleted submissions · free-text redacted to [deleted] on explicit deletion request</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A5</span>
            <span>Uptime monitoring and health probes</span>
            <code className="purpose-slug">uptime_monitoring</code>
          </div>
          <p className="purpose-desc">External probes of the /api/health and /api/health/deep endpoints to detect platform outages. Heartbeat monitoring on critical daily crons. Public status page reflecting component health and 30-day uptime history.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(f) — legitimate interest (platform availability monitoring is necessary for service reliability)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">None — probe traffic is system-to-system and contains only component health status text</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Better Stack (uptime monitoring), Slack (alert delivery)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">30 days rolling at Better Stack</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) · no personal information transmitted in probe traffic</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A6</span>
            <span>Cost and usage observability</span>
            <code className="purpose-slug">cost_usage_observability</code>
          </div>
          <p className="purpose-desc">Track per-organisation resource consumption (emails, WhatsApp/SMS, AI calls, Vercel invocations, Supabase compute) for unit-economics understanding, customer-facing usage counters, and overage billing where applicable.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (subscription and usage tracking) + s11(1)(f) — legitimate interest (platform economics)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Organisation ID, AI purpose codes, model, token counts, cost in cents, latency, success/error codes. No prompt text, no response text, no PII in metadata.</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Vercel (function invocation counts via management API)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">AI usage rows: 2 years · cost snapshots: 36 months · messaging usage and subscription charges: 5 years (Tax Administration Act)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A7</span>
            <span>Marketing waitlist</span>
            <code className="purpose-slug">marketing_waitlist</code>
          </div>
          <p className="purpose-desc">Capture email addresses of prospective customers via the /early-access waitlist page. Send a confirmation email and, when early access is opened, a launch notification. Marketing list is explicitly opt-in per POPIA s69 direct-marketing rules.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — consent (user explicitly submits the waitlist form)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Email address, self-declared role, consent timestamp, IP address, user agent</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage in waitlist table), Resend (confirmation and launch emails)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Until account creation (waitlist linked to user via matching email), or 12 months from submission if no account created</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) and s72(1)(b) consent basis</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A8</span>
            <span>Platform-level billing and subscriptions</span>
            <code className="purpose-slug">platform_billing</code>
          </div>
          <p className="purpose-desc">Manage Pleks&rsquo;s own subscription billing to agencies — tier selection, per-lease premium charges, overage billing, invoicing, and payment processing via PayFast.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (Terms of Service) + s11(1)(c) — compliance with law (Tax Administration Act, VAT Act)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Organisation billing contact name, email, phone, billing address, VAT number, invoice history, charge history, tier and feature selection, subscription state</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (invoice emails), PayFast (payment processing)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years from the date of the most recent charge (Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) + s72(1)(c) necessity for performance of contract · PayFast is SA-domiciled (domestic)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A9</span>
            <span>Support communications</span>
            <code className="purpose-slug">support_communications</code>
          </div>
          <p className="purpose-desc">Inbound email to support@pleks.co.za from users or non-users requesting assistance, and outbound responses. Includes POPIA data-subject requests that reach Pleks directly (routed to the correct Responsible Party).</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (support is implicit in the Terms of Service) + s11(1)(f) — legitimate interest</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Email address, name, message body (may contain arbitrary PII), attachment content, correspondence thread</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Resend (inbound/outbound email handling), Supabase (storage if archived in-platform)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">3 years from the date of the most recent correspondence, or indefinitely for threads that are part of an ongoing legal matter</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A10</span>
            <span>Audit logging</span>
            <code className="purpose-slug">audit_log</code>
          </div>
          <p className="purpose-desc">The audit_log table records every state-changing operation in Pleks — creation, update, deletion, and approval of records across the platform. Each row captures the actor, target, event type, timestamp, IP address, and change payload. The log is immutable — no UPDATE or DELETE policies exist on it.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(c) — compliance with law (POPIA s17 accountability; ECT Act record requirements) + s11(1)(f) — legitimate interest (security monitoring and fraud prevention)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Actor user ID, actor IP address, target entity identifiers, event type, before-and-after values of changed fields (may incidentally include PII), timestamp</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">7 years (SA business records retention and PPRA audit timelines) · subject-initiated erasure never removes audit_log rows</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A11</span>
            <span>In-product analytics <span className="not-deployed">Not deployed</span></span>
            <code className="purpose-slug">product_analytics</code>
          </div>
          <p className="purpose-desc">Understand how platform users navigate the product and which features they use. Currently not deployed — Pleks does not run a dedicated product-analytics tool on authenticated routes. This entry is recorded so that the absence of analytics is explicit rather than implicit.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(f) — legitimate interest (would apply when deployed, with balancing test documented)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Currently none</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Currently none · any future deployment will trigger a DPIA and a register version bump</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Not applicable</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Not applicable</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">A12</span>
            <span>Platform administration and customer-success observability</span>
            <code className="purpose-slug">platform_administration</code>
          </div>
          <p className="purpose-desc">Cross-agency operational observability for Pleks platform administrators — the /admin/platform-health dashboard (revenue vs cost, cost outliers, inactive-org flags), /admin/trust-health (overdue trust closes, FFC expiry), and /admin/popia-requests (routing inbox for data-subject requests that reach Pleks directly). Pleks routes agency-data matters to the correct Responsible Party and never executes agency-data operations directly.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(f) — legitimate interest (understanding platform health is necessary to serve customers reliably; no agency personal data exposed in aggregate form)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Organisation ID, name, agency FFC number and expiry, last-user-login timestamp, aggregated activity signals, cost attribution</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (customer-success outreach emails)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Active organisations: indefinite for operational signals · account closure: purged after billing-record retention window expires (5 years)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>
      </section>

      {/* Part B */}
      <section id="part-b">
        <p className="sec-num"><span className="bar" /><span>B · Pleks as Operator</span></p>
        <h2 className="sec-h">Operator <span className="hl">purposes</span></h2>
        <p>
          These 25 purposes are those for which an agency using Pleks is the <strong>Responsible Party</strong> and Pleks is the
          Operator. Every purpose here is processed on behalf of the agency, under the lawful basis the agency holds for the processing,
          under the Pleks Operator Agreement. <strong>The lawful basis shown is the agency&rsquo;s lawful basis for the underlying
          processing.</strong> The agency must confirm its lawful basis for each purpose in its own register.
        </p>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B1</span>
            <span>Property portfolio management</span>
            <code className="purpose-slug">property_portfolio</code>
          </div>
          <p className="purpose-desc">Record and maintain the agency&rsquo;s property portfolio — properties, buildings, units, managing schemes, insurance, brokers, furnishings, inspection profiles, unit types, clause profiles. Supports the agency&rsquo;s core property-management function.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (mandate agreement with landlord) + s11(1)(f) — legitimate interest (portfolio management is necessary for core business)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Property address, landlord relationship, broker identity, managing scheme contact details, insurance broker and policy contact, emergency contact</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), the AI model provider (AI-assisted property setup when used — see B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Duration of agency mandate + 5 years post-termination</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B2</span>
            <span>Landlord CRM and relationship management</span>
            <code className="purpose-slug">landlord_crm</code>
          </div>
          <p className="purpose-desc">Maintain landlord profiles, contact details, bank details for statement payouts, relationship history, and communication preferences. Supports owner statements, communications, and the landlord portal.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (mandate agreement with landlord) + s11(1)(c) — compliance with law (PPRA disclosure and tax obligations)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Name, ID number, date of birth, contact phone, contact email, addresses, bank account details (masked at rest, encrypted for operational use), marital status where relevant</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (landlord communications), Africa&rsquo;s Talking (SMS and WhatsApp)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Duration of mandate + 5 years post-termination (PPRA trust record retention)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B3</span>
            <span>Tenant application processing</span>
            <code className="purpose-slug">tenant_application</code>
          </div>
          <p className="purpose-desc">Accept rental applications from prospective tenants via the public /apply/[slug] portal. Capture form data, supporting documents (ID, proof of income, bank statements, employer letter), and consent records. Support the agency&rsquo;s shortlist-and-screen workflow. Also processes personal information of third parties named in the application: references, employer contacts, household members, emergency contacts.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — consent (applicant submits the form and consents to processing for the specific application) + s11(1)(b) — pre-contractual steps at the data subject&rsquo;s request</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Full name, ID number, DOB, contact phone/email, employment details, salary, dependent details, previous rental history, landlord/employer/character references, supporting documents</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), the payment gateway (application fee — B9), the credit bureau aggregator (credit check — B4), the AI model provider (income extraction — B22), DocuSeal (if application leads to lease signing)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Rejected/withdrawn applications: 12 months from rejection · Approved applications: absorbed into lease retention (5 years post-termination)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) for AI and hosting</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B4</span>
            <span>Credit checking (Searchworx)</span>
            <code className="purpose-slug">credit_check_searchworx</code>
          </div>
          <p className="purpose-desc">Obtain a credit bureau report on an applicant for the purpose of assessing tenancy suitability. Searchworx acts as the aggregator across TransUnion, Experian, Compuscan, and XDS. A DPIA has been flagged for this purpose. No credit check is performed without dual consent under POPIA s11(1)(a) and NCA s69.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — explicit consent (applicant consents to the specific purpose of a credit check before it is run; consent may be withdrawn for future checks but not to unwind a check already performed)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Applicant ID number, full name, DOB, residential addresses (current and historical), employment history, credit history, default records, civil judgments, credit score, affordability result</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Searchworx — SA-domiciled, domestic processing (see Appendix A11); underlying bureaus via Searchworx; Supabase (result storage); AI model provider (FitScore generation — B5)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">12 months from the pull date or lease termination date, whichever is later · consent log entry retained 10 years (POPIA s19 accountability)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">No for the credit check itself (Searchworx and SA credit bureaus are domestic) · Yes for derivative AI processing (FitScore via Anthropic — SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B5</span>
            <span>FitScore generation and applicant comparison</span>
            <code className="purpose-slug">fitscore</code>
          </div>
          <p className="purpose-desc">Generate a numeric affordability-and-suitability score for a rental applicant by combining credit check results (B4), verified income (B22 income extraction), rental history, and employment stability. Displayed to the agent alongside a human-readable rationale. FitScore is an assistive tool — it does not constitute an automated decision under POPIA s71. Final decisions are made solely by the agency or landlord.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">Follows Purpose B4 — s11(1)(a) explicit consent (applicant consented to the credit check knowing results would inform a suitability assessment)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Derivative of B4 (credit result) + declared income, verified income, rental history, employment information</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">The AI model provider (FitScore rationale narrative generation — B22), Supabase (storage)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Follows Purpose B4 (12 months or lease termination, whichever later)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs + s72(1)(b) consent basis)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B6</span>
            <span>Lease generation, signing, and document management</span>
            <code className="purpose-slug">lease_generation_signing</code>
          </div>
          <p className="purpose-desc">Generate a lease document from the agency&rsquo;s configured template + clause profile + unit-level overrides; render to PDF; route through DocuSeal for digital signing; store signed lease PDF and signatures. Covers lease creation, amendment, renewal, and termination document flows.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (the lease is the contract) + s11(1)(c) — compliance with law (RHA s5 written lease requirements, CPA s14, ECT Act signature requirements)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Full names, ID numbers, DOBs, contact details, employment details, signatures, co-tenant and landlord signatures, sureties if any</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase Storage (signed lease PDF), DocuSeal (signing — self-hosted, same infrastructure as Pleks), Resend (signing invitation emails), AI model provider (clause conflict checking — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-termination (Prescription Act + PPRA mandate practice)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) and s72(1)(c) necessity for performance of contract</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B7</span>
            <span>Lease lifecycle management</span>
            <code className="purpose-slug">lease_lifecycle</code>
          </div>
          <p className="purpose-desc">Manage the lease over its full lifecycle — activation, escalation at anniversaries, CPA s14 auto-renewal notice (20 business days before expiry), notice acknowledgement, amendment (with audit trail), termination, move-out, and deposit reconciliation.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA and CPA specific notice obligations)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant contact details, lease state, notice history</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend / Africa&rsquo;s Talking (notice delivery)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Follows Purpose B6 — 5 years post-termination</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B8</span>
            <span>Rent invoicing and payment tracking</span>
            <code className="purpose-slug">rent_invoicing_tracking</code>
          </div>
          <p className="purpose-desc">Generate monthly rent invoices and maintain the rent ledger per lease showing invoiced amounts, received amounts (matched from trust reconciliation — B12), and outstanding balances. Pleks does not execute rent collection under any payment rail — all money moves directly between the tenant&rsquo;s and agency&rsquo;s SA banks.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (the lease establishes the rent obligation) + s11(1)(c) — compliance with law (PPRA record-keeping, Tax Administration Act)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant name, lease identifier, rent amount, invoice history, payment receipt history. No tenant bank account numbers are stored by Pleks.</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-lease-termination (PPRA record retention + Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — Supabase storage (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B9</span>
            <span>Application fee processing (payment gateway)</span>
            <code className="purpose-slug">application_fee_processing</code>
          </div>
          <p className="purpose-desc">Accept the applicant&rsquo;s rental application fee directly via PayFast. The fee is a Pleks-to-applicant service charge covering the cost of the underlying credit bureau report and Pleks&rsquo;s cost of operating the application-processing service. The agency receives no portion of this fee under any tier or commercial arrangement.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — consent (applicant initiates payment knowing the purpose) + s11(1)(b) — contract</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Applicant name, email, payment amount, transaction reference, payment method indicator (not full card number — PayFast is the PCI boundary)</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">PayFast — SA-domiciled (see Appendix A6)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years (Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">No — PayFast is SA-domiciled (domestic processing)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B10</span>
            <span>Owner (landlord) statements</span>
            <code className="purpose-slug">owner_statements</code>
          </div>
          <p className="purpose-desc">Generate monthly statements for each landlord showing rent collected, deductions (management fees, maintenance, municipal, deposit transactions), and net payable. Deliver via email or landlord portal.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (mandate requires financial reporting) + s11(1)(c) — compliance with law (PPRA statement-of-account requirements)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Landlord name, contact details, property portfolio breakdown, financial transaction data</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (email delivery), AI model provider (welcome pack narrative — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years from statement date (Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B11</span>
            <span>Rent ledger, arrears, and letters of demand</span>
            <code className="purpose-slug">rent_ledger_arrears</code>
          </div>
          <p className="purpose-desc">Maintain the rent ledger per lease, track arrears cases, and escalate arrears through a graduated sequence — informal reminder → formal reminder → letter of demand → final notice before cancellation. Record payment arrangements and resolve cases.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (formal demand requirements, RHA s4B) + s11(1)(f) — legitimate interest (protecting landlord&rsquo;s income)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant contact details, payment history, arrears amount, communications sent, arrears case state</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend / Africa&rsquo;s Talking (communication delivery), AI model provider (LOD text generation — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-termination (Prescription Act + PPRA + Tribunal evidentiary practice)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B12</span>
            <span>Trust account reconciliation</span>
            <code className="purpose-slug">trust_reconciliation</code>
          </div>
          <p className="purpose-desc">Monthly reconciliation of the agency&rsquo;s Section 86 trust account. Bank statement import (OFX/CSV/QIF), matching rent receipts against ledger entries, verification of disbursements, three-balance comparison, and sign-off. Produces an PPRA-compliant audit export (PDF + XLSX) with SHA-256 manifest hash for tamper-evidence.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(c) — compliance with law (Property Practitioners Act s54, Estate Agency Affairs Act s32 trust account requirements, PPRA audit requirements, Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant names on trust transactions, landlord and supplier names on disbursements, transaction amounts, payment references, dates, bank statement narrative text, masked bank account numbers (encrypted at rest)</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), AI model provider (variance explanation narrative — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years (PPRA trust record retention + Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs) · bank data import is local file upload (no cross-border transfer component)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B13</span>
            <span>Deposit management</span>
            <code className="purpose-slug">deposit_management</code>
          </div>
          <p className="purpose-desc">Record deposit receipts, accrue interest (prime-linked, fixed, repo-linked, or manual), generate interest statements, handle deposit deductions at move-out (wear-and-tear vs damage classification with per-item justification), and issue itemised deduction schedule within 21 days per Rental Housing Act s5(7).</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (Rental Housing Act s5 deposit rules, PPRA trust account rules)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant name, deposit amount, interest accrued, deduction history with per-item details, photos of damage claimed, wear-and-tear assessments</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage including photo storage), Resend (statement delivery), AI model provider (deduction justification narrative — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-termination (PPRA trust record retention)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B14</span>
            <span>Inspection management</span>
            <code className="purpose-slug">inspection_management</code>
          </div>
          <p className="purpose-desc">Schedule and conduct property inspections (move-in, periodic, move-out). Capture condition per room and per item. Preserve photo EXIF data (GPS and timestamp) for Tribunal evidentiary purposes. Generate inspection PDF with agent and tenant signatures.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (Rental Housing Act inspection requirements)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant name and signature, agent name and signature, property address, photos of the property interior and exterior (EXIF GPS and timestamp preserved; may incidentally include tenant belongings or persons)</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase Storage (photos and PDFs), AI model provider (wear-and-tear assessment — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">3 years post-termination · 5 years if a Tribunal dispute arises within the retention window</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B15</span>
            <span>Maintenance management</span>
            <code className="purpose-slug">maintenance_management</code>
          </div>
          <p className="purpose-desc">Accept maintenance requests from tenants (via portal, WhatsApp, or SMS), AI-triage for severity and category, assign to contractors, track progress, record completion, split costs between landlord / tenant / other parties, and handle delays and contractor communication.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA s4B habitability duty)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant name and contact details, description of the issue, photos of the issue, contractor assignment, cost allocation</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Africa&rsquo;s Talking (WhatsApp/SMS for contractor notifications), AI model provider (maintenance triage — B22), Resend (email notifications)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">3 years post-completion (Tribunal evidentiary practice)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a)) for AI and email · SMS/WhatsApp is domestic via Africa&rsquo;s Talking</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B16</span>
            <span>Critical incident handling</span>
            <code className="purpose-slug">critical_incident</code>
          </div>
          <p className="purpose-desc">Handle high-severity maintenance incidents (fire, burst pipe, major break-in, geyser failure) with an expedited workflow. Notify broker (for insurable events), owner, and managing scheme in parallel. Record the incident and the decisions taken. Integrates with insurance claim preparation.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(d) — legal obligation + s11(1)(e) — legitimate interest of a third party (insurance claim preparation) + s11(1)(f) — Responsible Party&rsquo;s legitimate interest</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">As B15 plus insurance broker and policy contact details, owner notification preferences, scheme notification preferences</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (broker and scheme notifications), Africa&rsquo;s Talking (urgent contractor dispatch)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years (insurance claim evidence + Tribunal evidentiary practice)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B17</span>
            <span>Tenant communications lifecycle</span>
            <code className="purpose-slug">tenant_communications</code>
          </div>
          <p className="purpose-desc">The tenant-facing communication layer across the full tenancy — rent invoices, payment receipts, monthly statements, arrears escalation, lease lifecycle events, inspection reminders, maintenance updates, deposit events, portal invitations, retry cascades, and delivery tracking. WhatsApp-primary with SMS and email backup.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (RHA and CPA mandatory notice obligations; mandatory comms bypass tenant opt-out preferences)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Tenant name, contact phone, contact email, message body, delivery status, WhatsApp template variant used, communication preferences for non-mandatory comms</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Africa&rsquo;s Talking (WhatsApp via Meta Business, SMS), Resend (email), Meta (WhatsApp Business Platform), Supabase (storage with full-body retention for Tribunal evidence)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-termination (aligned with trust records; Tax Administration Act support)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — Meta WhatsApp Business is US/IE; Resend is US. SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B18</span>
            <span>Supplier / contractor management</span>
            <code className="purpose-slug">supplier_management</code>
          </div>
          <p className="purpose-desc">Maintain the agency&rsquo;s list of contractors and suppliers, their trade categories, FFC/PPRA status where applicable, contact details, job history, invoice submissions, and payments. Support the contractor portal for job communication and status updates.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (contractor mandate for specific jobs) + s11(1)(c) — compliance with law (agency duty to verify contractor legitimacy)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Contractor name, contact details, trade, rates, FFC number if applicable, bank details for payment (encrypted), job history, invoice submissions</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend / Africa&rsquo;s Talking (communications)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years from last engagement (Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B19</span>
            <span>Municipal bill processing</span>
            <code className="purpose-slug">municipal_bill_processing</code>
          </div>
          <p className="purpose-desc">Parse municipal bills (rates, water, electricity, refuse) via AI extraction when uploaded by the agent. Allocate charges across properties when the bill covers multiple units. Flag anomalies (sudden increases, unusual consumption). Support payment tracking.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract (mandate to manage property expenses) + s11(1)(c) — compliance with law (PPRA property-management record keeping)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Property address, account holder (usually the landlord), municipal account number, consumption and charge data</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), AI model provider (bill extraction — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years (Tax Administration Act s29)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B20</span>
            <span>HOA / Body Corporate / Managing Scheme</span>
            <code className="purpose-slug">hoa_scheme_management</code>
          </div>
          <p className="purpose-desc">For properties in a Homeowners Association or Body Corporate, manage levy schedules, AGM documents, reserve fund contributions, levy arrears, and scheme contact details.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (Sectional Titles Schemes Management Act)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Scheme contact details, levy payment history per owner, AGM attendance and voting records where relevant</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (AGM and levy communications), AI model provider (AGM notice drafting — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years (STSMA and tax retention) · AGM records per scheme bylaws (indefinite in most cases)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — AI processing via Anthropic (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B21</span>
            <span>Document generation and storage</span>
            <code className="purpose-slug">document_generation</code>
          </div>
          <p className="purpose-desc">Generate, store, and deliver documents that combine data from multiple Part B purposes — welcome packs for new tenants, landlord reports, property rules documents, inspection certificates, arrears bundles, and compliance packs for Tribunal proceedings.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(b) — contract + s11(1)(c) — compliance with law (varies by document type; follows the source purpose)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Names, contact details, financial data, and other personal information drawn from source purposes; AI-generated narrative text</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase Storage (document storage), Resend (document delivery), AI model provider (narrative generation — B22)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Follows the source data (typically 5 years post-termination for lease records)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — SCCs (s72(1)(a))</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B22</span>
            <span>AI-assisted processing</span>
            <code className="purpose-slug">ai_assisted_processing</code>
          </div>
          <p className="purpose-desc">Bounded, assistive AI processing across multiple workflows — income extraction from bank statements, FitScore rationale, maintenance triage, deposit deduction justification, lease clause conflict checking, arrears letter drafting, wear-and-tear assessment, municipal bill extraction, AGM notice drafting, and trust audit narrative. AI processing is assistive only: Pleks does not make automated decisions about tenants or applicants. All decisions remain with the agency or landlord. Prompts and responses are not retained — Anthropic operates under a zero-retention Enterprise DPA.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">Multiple — follows the lawful basis of the sub-purpose (e.g., B4 consent for FitScore, B7 contract for lease clause checking)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Structured context specific to the sub-purpose only — no full PII profiles passed. No prompt text or response text retained by Pleks or Anthropic.</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Anthropic — see Appendix A2 (zero-retention Enterprise DPA + SCCs)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">No retention — zero-retention DPA with Anthropic; derivative outputs follow the source purpose&rsquo;s retention period</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — Anthropic is US-based. SCCs (s72(1)(a)) + zero-retention Enterprise DPA</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B23</span>
            <span>POPIA data-subject request handling</span>
            <code className="purpose-slug">popia_subject_requests</code>
          </div>
          <p className="purpose-desc">Process data-subject requests — access (s23), correction (s24), deletion (s25), objection (s11(3)), restriction, and portability — received via the in-platform subject-rights dashboard or direct contact. For Part B requests, Pleks routes to the correct agency (Responsible Party) and supports the agency&rsquo;s 30-day response window. For Part A requests, Pleks responds directly.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(c) — compliance with law (POPIA Chapter 5 and Chapter 10 obligations)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Data subject identity, request type, correspondence, resolution decision, consent log entries, audit trail of request processing</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (storage), Resend (response communications)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">10 years (POPIA accountability obligations; audit trail of rights exercises)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — Supabase storage (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B24</span>
            <span>FICA / KYC documentation storage</span>
            <code className="purpose-slug">fica_kyc_storage</code>
          </div>
          <p className="purpose-desc">Store FICA / KYC documentation for agencies that are Accountable Institutions under the Financial Intelligence Centre Act — copies of founding documents, director ID documents, proof of address, tax numbers. Supports the agency&rsquo;s own FICA compliance obligations.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(c) — compliance with law (Financial Intelligence Centre Act s22/s23 record-keeping obligations for Accountable Institutions)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Name, ID number, proof of address, banking details, SARS tax number — all stored encrypted at rest in Supabase Storage</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Supabase (encrypted storage)</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">5 years post-termination of business relationship (FICA s23 record-keeping obligation)</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Yes — Supabase storage (SCCs)</span></div>
          </div>
        </div>

        <div className="purpose-entry">
          <div className="purpose-hdr">
            <span className="purpose-id">B25</span>
            <span>Agency-originated direct marketing to tenants and landlords <span className="not-deployed">Reserved — not deployed</span></span>
            <code className="purpose-slug">agency_direct_marketing</code>
          </div>
          <p className="purpose-desc">Reserved placeholder for a future capability that would allow agencies to send opted-in marketing communications (e.g., property listings, market commentary) to their own tenant or landlord contacts via the Pleks platform. Not currently deployed. Any deployment will require a new consent basis, a register version bump, and re-consent notification per the maintenance discipline.</p>
          <div className="purpose-meta">
            <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">s11(1)(a) — explicit consent (would be required before any deployment)</span></div>
            <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">Currently none</span></div>
            <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">Currently none · any deployment requires DPIA and register version bump</span></div>
            <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">Not applicable</span></div>
            <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">Not applicable</span></div>
          </div>
        </div>
      </section>

      {/* Appendix — Operators directory */}
      <section id="operators">
        <p className="sec-num"><span className="bar" /><span>C · Appendix A</span></p>
        <h2 className="sec-h">Operators <span className="hl">directory</span></h2>
        <p>
          Every third party Pleks uses in the course of processing personal information. For each: what they do, where they are
          domiciled, what contractual instrument governs the relationship, and which purposes they serve.
        </p>
        <table className="reg-operators">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Operator</th>
              <th style={{ width: "30%" }}>Role</th>
              <th style={{ width: "15%" }}>Domicile</th>
              <th>Instrument</th>
              <th style={{ width: "14%" }}>Purposes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="op-name">Supabase<span className="sub">database · storage · auth</span></td>
              <td>Backend-as-a-service — Postgres database, authentication, storage, realtime</td>
              <td>US (regional data residency configurable)</td>
              <td>Terms of Service + Data Processing Addendum with SCCs. Sub-processor: AWS.</td>
              <td>A1–A12, B1–B25</td>
            </tr>
            <tr>
              <td className="op-name">Anthropic<span className="sub">AI model provider</span></td>
              <td>Claude Haiku 4.5, Sonnet 4.6, Opus 4.6 — bounded assistive-only AI processing</td>
              <td>US (San Francisco)</td>
              <td>Anthropic Commercial Terms + DPA with SCCs + zero-retention Enterprise agreement (no API inputs or outputs retained for training)</td>
              <td>B22</td>
            </tr>
            <tr>
              <td className="op-name">Sentry<span className="sub">error monitoring</span></td>
              <td>Exception tracking for platform defect detection. All events PII-scrubbed before transmission.</td>
              <td>US (San Francisco)</td>
              <td>Sentry Terms of Service + DPA with SCCs</td>
              <td>A3 only</td>
            </tr>
            <tr>
              <td className="op-name">Resend<span className="sub">transactional email</span></td>
              <td>Transactional and marketing email delivery. Suppression list and DKIM/SPF/DMARC enforced.</td>
              <td>US</td>
              <td>Resend Terms of Service + DPA with SCCs</td>
              <td>A1, A4, A7–A9, A12; B2, B7, B10, B11, B17, B21, B23</td>
            </tr>
            <tr>
              <td className="op-name">Africa&rsquo;s Talking<span className="sub">SMS · WhatsApp aggregation</span></td>
              <td>SMS and WhatsApp Business Platform aggregation for SA mobile networks. Routes WhatsApp through Meta.</td>
              <td>Kenya (Nairobi)</td>
              <td>Africa&rsquo;s Talking Terms of Service + DPA</td>
              <td>B2, B11, B15–B18</td>
            </tr>
            <tr>
              <td className="op-name">PayFast<span className="sub">payment gateway</span></td>
              <td>Payment processing for application fees and Pleks subscription payments. PCI DSS Level 1 certified.</td>
              <td>South Africa (domestic)</td>
              <td>PayFast Merchant Agreement. Pleks never sees full card PAN — PayFast is the PCI boundary.</td>
              <td>B9, A8 (limited)</td>
            </tr>
            <tr>
              <td className="op-name">DocuSeal<span className="sub">e-signature · self-hosted</span></td>
              <td>Digital signature and document-signing workflow. Self-hosted on infrastructure Pleks controls — same privacy boundary as Pleks itself.</td>
              <td>Self-hosted (same as Supabase/Vercel infrastructure)</td>
              <td>DocuSeal open-source licence. No third-party DPA required — no data leaves Pleks&rsquo;s infrastructure.</td>
              <td>B6</td>
            </tr>
            <tr>
              <td className="op-name">Meta<span className="sub">WhatsApp Business</span></td>
              <td>Upstream WhatsApp Business Platform provider — reached via Africa&rsquo;s Talking. Meta-approved templates for transactional messages only.</td>
              <td>US (California) / Ireland (EU)</td>
              <td>Meta&rsquo;s terms mediated through Africa&rsquo;s Talking relationship</td>
              <td>B17</td>
            </tr>
            <tr>
              <td className="op-name">Better Stack<span className="sub">uptime monitoring</span></td>
              <td>Uptime monitoring, heartbeat tracking, and alerting. No PII in probe traffic.</td>
              <td>US (Delaware)</td>
              <td>Better Stack Terms of Service + DPA with SCCs</td>
              <td>A5 only</td>
            </tr>
            <tr>
              <td className="op-name">Vercel<span className="sub">application hosting</span></td>
              <td>Next.js hosting, edge-function invocation, CDN. Hosts the entire Pleks application.</td>
              <td>US (San Francisco), global edge</td>
              <td>Vercel Terms of Service + DPA with SCCs. Logs are POPIA-scrubbed consistent with observability policy.</td>
              <td>A1–A12, B1–B25</td>
            </tr>
            <tr>
              <td className="op-name">Searchworx<span className="sub">credit bureau aggregator</span></td>
              <td>Credit bureau intermediary — aggregates TransUnion, Experian, Compuscan, XDS, Home Affairs (DHA), TPN. Explicit applicant consent required per check.</td>
              <td>South Africa (Johannesburg — domestic)</td>
              <td>Searchworx Services Agreement + POPIA-compliant DPA. Searchworx is itself bound by NCA, POPIA, and FICA regulatory obligations.</td>
              <td>B4 only</td>
            </tr>
            <tr>
              <td className="op-name">GitHub<span className="sub">source code hosting</span></td>
              <td>Source-code hosting. Processes contributor PII (commit author identities) only — no customer personal information.</td>
              <td>US (San Francisco)</td>
              <td>GitHub Terms of Service. Secret-scanning and Dependabot enabled. No customer data in code.</td>
              <td>None for customer data</td>
            </tr>
          </tbody>
        </table>
        <p>
          This register is maintained as a living document. Every new processing purpose or new Operator introduced by a subsequent
          Pleks build specification requires an entry here before the feature ships. The version number increments on every material
          change (new purpose, new Operator, new cross-border transfer, retention period change, lawful basis change). Material changes
          also trigger a re-consent notification flow to affected agencies.
        </p>
        <p>
          For questions about this register, to exercise your rights as a data subject, or to request a copy of the Pleks Operator
          Agreement, contact our Information Officer — see §02 above.
        </p>
      </section>
    </LegalPageLayout>
  )
}
