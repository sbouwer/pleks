/**
 * app/(public)/popia-register/page.tsx — POPIA processing-purpose register
 *
 * Route:  /popia-register
 * Auth:   public
 * Notes:  Covers Part A (Pleks-RP purposes) and Part B (Operator purposes).
 */
import type { Metadata } from "next"
import Link from "next/link"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"
import { POPIA_PURPOSES } from "@/lib/legal/popia-purposes"
import { OPERATORS } from "@/lib/legal/operators"
import { MARKETING_FACTS } from "@/lib/marketing/facts"

export const metadata: Metadata = {
  title: "Processing Register — Pleks",
  description: "Pleks's POPIA s17 processing-purpose register — all platform and operator purposes, lawful bases, data categories, retention periods, and operators directory.",
}

const SECTIONS = [
  { id: "about",       num: "00", label: "About this register" },
  { id: "controllers", num: "01", label: "Controllers"         },
  { id: "officer",     num: "02", label: "Information officer" },
  { id: "security",       num: "03", label: "Security safeguards" },
  { id: "subject-rights", num: "04", label: "Data-subject rights" },
  { id: "part-a",         num: "A·", label: "Platform purposes"  },
  { id: "part-b",      num: "B·", label: "Operator purposes"  },
  { id: "operators",   num: "C·", label: "Operators directory" },
]

export default function ProcessingRegisterPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["POPIA · S17 · S18", "processing register", LEGAL_VERSIONS.popiaRegister]}
      titleBefore="Processing"
      titleHighlight="register"
      subtitle={`Pleks's POPIA processing-purpose register — all ${MARKETING_FACTS.popiaPurposes.partA} platform purposes and ${MARKETING_FACTS.popiaPurposes.partB} operator purposes, with lawful bases, data categories, retention periods, and the full operators directory.`}
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 13", mono: true },
        { label: "In force from",  value: "2026 · 05 · 01", mono: true },
        { label: "Version",        value: LEGAL_VERSIONS.popiaRegister, mono: true },
        { label: "Standard",       value: "POPIA s17 · s18"              },
      ]}
      sections={SECTIONS}
      hasSummary
      showDocLinks
      endLabel={`END · PROCESSING REGISTER · ${LEGAL_VERSIONS.popiaRegister}`}
    >
      {/* Summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this register covers</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>Pleks operates in two roles: as <strong>Responsible Party</strong> for {MARKETING_FACTS.popiaPurposes.partA} platform purposes (authentication, billing, support — Part A) and as <strong>Operator</strong> for {MARKETING_FACTS.popiaPurposes.partB} agency-side purposes (tenant data, leases, inspections, credit and criminal screening, property-intelligence — Part B).</span></li>
          <li><span className="b" /><span>For Part B data, the <strong>agency is the Responsible Party</strong>. Data-subject requests about tenant or lease records must be directed to the agency, not to Pleks.</span></li>
          <li><span className="b" /><span>Credit checks (B4) require the applicant&rsquo;s <strong>explicit consent</strong> under <span className="act-pill">POPIA · S11(1)(a)</span> and the Credit Bureau Code of Conduct (issued under POPIA, October 2020) before any bureau query is submitted.</span></li>
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
          principle — Responsible Party must have measures in place to ensure compliance) and{" "}
          <span className="act-pill">POPIA · S18</span>{" "}
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
          for that data. For Part A data (your Pleks account), your rights are exercised against Pleks directly. Under{" "}
          <span className="act-pill">PAIA</span>, requests for access to records held by Pleks on behalf of a client agency must be
          directed to that agency&rsquo;s Information Officer, not to Pleks. Pleks will acknowledge any misdirected request within
          2 business days and route it to the correct Responsible Party within 5 business days — so the agency&rsquo;s statutory
          30-calendar-day response clock under s23(1) (per PAIA s25, extendable under s26) is not materially eroded.
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
          behalf under section 09 of the Pleks Terms of Service (&ldquo;ToS §09&rdquo;), which constitutes the mandatory written-contract
          terms required by <span className="act-pill">POPIA · S20</span> and <span className="act-pill">POPIA · S21</span>. Under{" "}
          <span className="act-pill">POPIA · S21</span> (Operator-to-RP notification), Pleks will notify the agency without undue
          delay — and as a contractual commitment exceeding POPIA&rsquo;s s21 baseline, within 72 hours of becoming aware — of any
          personal information breach affecting data for which the agency is the Responsible Party. The 72-hour window is a Pleks
          contractual obligation, not a POPIA statutory requirement; POPIA s21 requires notification &ldquo;without undue delay.&rdquo;
          The agency must then assess whether its own{" "}
          <span className="act-pill">POPIA · S22</span> obligations to notify the Information Regulator and affected data subjects
          are triggered. The breach-notification obligation is given contractual force in ToS §09.4.
        </p>
        <p>
          <strong>Agency audit rights over Pleks as Operator.</strong> Under{" "}
          <span className="act-pill">POPIA · S21</span>, agencies as Responsible Parties have the right to verify Pleks&rsquo;s compliance
          with ToS §09. Pleks supports this right through: (a) this publicly available processing-purpose register;
          (b) provision of a completed security questionnaire or equivalent on written request (at no cost, once per 12 months); and
          (c) cooperation with reasonable compliance audits on 30 days&rsquo; written notice, subject to confidentiality obligations
          protecting other agencies&rsquo; data. The full audit-rights framework is set out in{" "}
          <Link href="/terms#dataprocessing">ToS §09.5</Link>.
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
            Stéan Bouwer · Pleks (Pty) Ltd<br />
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
        <div className="officer-card">
          <span className="l">Deputy IO /<br />succession</span>
          <span className="v">
            Role vacant — to be appointed under <span className="act-pill">POPIA · S56</span> as the organisation grows.
            In the interim, any IO incapacity is covered by the board director of Pleks (Pty) Ltd.<br />
            <span className="sub">Pleks is registered with the Information Regulator under POPIA s55. Registration number on file with the IO.</span>
          </span>
        </div>
        <div className="officer-card">
          <span className="l">Information<br />Regulator</span>
          <span className="v">
            Information Regulator of South Africa<br />
            <span className="sub">
              JD House, 27 Stiemens Street, Braamfontein, 2001 ·{" "}
              <ExtLink href={EXTERNAL_LINKS.informationRegulator}>inforegulator.org.za</ExtLink>
              {" "}· 010 023 5207
            </span>
          </span>
        </div>
        <p>
          Every data subject has the unconditional right to complain to the Information Regulator independently of Pleks or the
          agency&rsquo;s response. The Regulator&rsquo;s contact details are surfaced on every data-subject-rights interface in the platform.
          Formal information-access requests to Pleks under <span className="act-pill">PAIA</span> must be submitted on Form 2 (Request
          for Access to Record of Public/Private Body), available from the Information Regulator. Pleks will respond using Form 3
          (Outcome of Request and Notice of Fees) within the statutory 30-day window. In compliance with{" "}
          <span className="act-pill">PAIA · S51(3)</span> and the 2021 Regulations, the Pleks PAIA manual is published on this
          website at <Link href="/paia-manual">/paia-manual</Link>.
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
          <li><strong>Encryption in transit:</strong> TLS 1.3 for all connections; HSTS enforced; no plaintext fallback.</li>
          <li><strong>Encryption at rest:</strong> AES-256 at the database layer via the database and storage provider (see §C); sensitive fields (bank account numbers, TOTP secrets, passkey credentials) additionally encrypted at the column level.</li>
          <li><strong>Row-Level Security:</strong> Postgres RLS enforced on every table carrying personal information; service-role access restricted to server-side only with org-scoped gateway helper; no broad-access admin views.</li>
          <li><strong>Authentication:</strong> magic-link auth for tenant/landlord/supplier roles; password + mandatory MFA for agent roles; MFA step-up required for fiduciary-class actions.</li>
          <li><strong>Immutable audit logging:</strong> every state-changing operation recorded in <code>audit_log</code> with actor, target, event type, timestamp, and change payload; no UPDATE or DELETE policies on the log.</li>
          <li><strong>PII scrubbing for observability:</strong> error monitoring and log aggregation tools receive PII-scrubbed events only; scrubber runs pre-transmission and strips request bodies from sensitive routes and PII patterns from all payloads.</li>
          <li><strong>Signed URLs with TTL:</strong> all sensitive downloads use time-limited signed URLs; no public bucket access to customer data.</li>
          <li><strong>Operator contractual controls:</strong> every third-party Operator operates under a Data Processing Addendum with SCCs where cross-border, and documented retention and breach-notification terms.</li>
        </ul>
        <p>
          <strong>Data quality (<span className="act-pill">POPIA · S16</span> / <span className="act-pill">S11(2)</span>).</strong>{" "}
          Pleks is obliged to keep personal information complete, accurate, not misleading, and updated. For Part A data, Pleks owns
          this obligation directly. For Part B data, the agency is the Responsible Party and holds the quality obligation; Pleks
          provides the mechanism (the s23 in-platform correction interface in Purpose B23) to discharge it. Accuracy is especially
          consequential in credit checking (B4), FitScore generation (B5), and arrears management (B11) — an inaccurate data point
          in any of these purposes can have legal and financial consequences for the data subject. Pleks surfaces data-quality alerts
          when it detects internally inconsistent records (e.g., arrears balance vs trust reconciliation mismatch). Agencies must act
          on correction requests within the 30-calendar-day window under s23(1) (per PAIA s25). Pleks will propagate confirmed corrections to all
          downstream records that derived from the corrected source data.
        </p>
        <p>
          Where multiple retention periods apply to the same record, Pleks enforces the longest applicable statutory, contractual, or
          evidentiary period. Purpose-level retention periods in this register are minimum commitments and may be overridden by mandatory
          statutory retention (Tax Administration Act s29 — 5 years; PPRA trust records; FIC Act s23 — 5 years; Companies Act s24 — accounting records, 7 years), active
          legal holds, subject-request restrictions, ongoing disputes, or subpoenas.
        </p>
        <p>
          <strong>Special personal information (<span className="act-pill">POPIA · S26</span>–<span className="act-pill">S27</span>).</strong>{" "}
          Pleks does not solicit special personal information as defined in POPIA s26 (religious/political beliefs, race/ethnicity, trade-union
          membership, health/sex life, criminal behaviour, biometric information). However, special PI may appear incidentally in free-text
          fields or photos: a maintenance request may reference a tenant&rsquo;s medical condition; an inspection photo may incidentally capture
          religious symbols or other s26 attributes. Where this occurs, the agency as Responsible Party must hold a valid s27 ground for
          processing (typically s27(1)(a) explicit consent or s27(1)(d) law-compliance necessity). Pleks&rsquo;s UI includes contextual nudges
          discouraging agents from entering special PI in free-text fields that are not structured for it. Agencies should configure their
          own data-minimisation policies for their teams. Pleks will flag any pattern of systematic special-PI collection identified through
          its Operator oversight function.
        </p>
        <p>
          <strong>DPIA programme.</strong> Pleks conducts a Data Protection Impact Assessment before deploying or materially changing
          any processing purpose that involves: (a) credit data or financial scores about natural persons (currently B4, B5);
          (b) special personal information (s26); (c) AI-derived assessments of natural persons (B22); (d) persistent or precise location
          data, including EXIF GPS metadata in inspection photography (B14); or (e) systematic processing of children&rsquo;s personal
          information (B3). A completed DPIA is a deployment prerequisite — no such purpose ships without one. DPIA records are retained
          for the life of the purpose.
        </p>
        <p>
          <strong>Sub-processor authorisation and change notification.</strong> Pleks uses general written authorisation from agencies
          for the sub-processors listed in Section C of this register (consistent with POPIA s21(2) and industry practice). When Pleks
          changes a sub-processor in a way that materially affects agencies&rsquo; data, Pleks will notify agencies by email to their
          registered Information Officer address at least 30 days before the change takes effect, giving agencies a reasonable right to
          object. Changes that do not materially affect data processing (e.g., infrastructure migration within the same legal entity or
          jurisdiction) are recorded in the register&rsquo;s version history without the 30-day window. The current sub-processor list
          is maintained in Section C of this register and is updated on every version increment.
        </p>
      </section>

      {/* 04 — Data-subject rights */}
      <section id="subject-rights">
        <p className="sec-num"><span className="bar" /><span>04 · Rights</span></p>
        <h2 className="sec-h">Data-subject <span className="hl">rights</span></h2>
        <p>
          POPIA confers the following rights on every data subject whose personal information Pleks processes (as Responsible Party —
          Part A) or processes on behalf of an agency (as Operator — Part B). For Part B rights, exercise them against the agency
          (the Responsible Party); Pleks will support the agency&rsquo;s response. The channel for each right is shown below.
        </p>
        <ul className="legal-list">
          <li>
            <strong>Right of access (s23).</strong> Request a copy of the personal information Pleks holds about you, the categories
            of recipients, the source, and the purpose. <em>Channel:</em> submit Form 2 to our Information Officer
            at <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a> or via the in-platform subject-rights dashboard.
            Response within 30 calendar days, extendable per PAIA s26.
          </li>
          <li>
            <strong>Right to correction (s24).</strong> Request correction or deletion of inaccurate, misleading, outdated, incomplete,
            or unlawfully obtained personal information, and notification to third parties to whom it was disclosed.{" "}
            <em>Channel:</em> in-platform settings (immediate self-serve for profile data) or Information Officer for other records.
          </li>
          <li>
            <strong>Right to deletion / restriction (s25).</strong> Request destruction or deletion of personal information Pleks is
            no longer authorised to retain. Note: statutory retention obligations (s29 Tax Administration Act, PPRA, audit logs) may
            prevent deletion during the applicable retention window; Pleks will explain the basis for any retention that continues
            after a deletion request. If you are not satisfied with Pleks&rsquo;s response, you may apply to the Information Regulator
            under <span className="act-pill">POPIA · S74</span> or to a court under <span className="act-pill">POPIA · S99</span>.{" "}
            <em>Channel:</em> Information Officer.
          </li>
          <li>
            <strong>Right to object (s11(3)).</strong> Where Pleks&rsquo;s lawful basis is legitimate interest
            (<span className="act-pill">POPIA · S11(1)(f)</span>) — purposes A3, A5, A6, A10, A12, B11, B16 — you have the right to
            object to processing on reasonable grounds relating to your particular situation. Pleks will cease processing unless it can
            demonstrate compelling legitimate grounds that override your interests, or processing is necessary for the exercise or
            defence of legal claims. <em>Channel:</em> Information Officer or the in-platform subject-rights dashboard.
          </li>
          <li>
            <strong>Automated-decision rights (s71).</strong> Pleks does not make automated decisions about data subjects that produce
            legal or similarly significant effects. FitScore (B5) is assistive only — final tenancy decisions remain with the agency.
            If this changes, affected data subjects will have the right to request human review, to express their point of view, and
            to receive an explanation of the decision. <em>Channel:</em> Information Officer.
          </li>
          <li>
            <strong>Direct-marketing opt-out (s69 / s11(3)).</strong> Where Pleks sends any direct marketing (A7 waitlist communications,
            any future B25 agency marketing), you may opt out at any time via the unsubscribe link in every message or by contacting the
            Information Officer. Opt-outs are honoured within 5 business days. <em>Channel:</em> unsubscribe link or Information Officer.
          </li>
          <li>
            <strong>Right to complain (POPIA s74).</strong> You may lodge a complaint with the Information Regulator at any time,
            independently of Pleks&rsquo;s or the agency&rsquo;s response. See §02 for the Regulator&rsquo;s contact details.
          </li>
        </ul>
      </section>

      {/* Part A */}
      <section id="part-a">
        <p className="sec-num"><span className="bar" /><span>A · Pleks as Responsible Party</span></p>
        <h2 className="sec-h">Platform <span className="hl">purposes</span></h2>
        <p>
          These {MARKETING_FACTS.popiaPurposes.partA} purposes are those for which Pleks itself is the Responsible Party. The lawful basis for each is normally either
          performance of the contract between Pleks and the platform user (the Terms of Service, <span className="act-pill">POPIA · S11(1)(b)</span>),
          or Pleks&rsquo;s legitimate interest in operating a reliable and secure service (<span className="act-pill">POPIA · S11(1)(f)</span>),
          with appropriate balancing against the data subject&rsquo;s interests.
        </p>

        <div className="summary-card" id="fitscore-isolation">
          <p className="sc-eyebrow">§07 Charter · Agency isolation</p>
          <p className="sc-h">Enforced at 4 layers</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 20 }}>
            {[
              {
                layer: "Layer 1 · Database",
                title: "Row Level Security on every table",
                body: "Postgres RLS policies are defined on every agency-scoped table and enforced by the database engine, not the application layer. Every policy carries both USING and WITH CHECK clauses — reads and writes are equally gated. The anon key, used on all client-facing paths, cannot bypass RLS. A direct SQL query using the anon key fails the policy check if org_id does not match the session organisation.",
              },
              {
                layer: "Layer 2 · Application",
                title: "Gateway org_id binding",
                body: "Every server-side read and write path passes through gateway() or requireAgentWriteAccess(), which bind the session orgId to the Supabase client before any query executes. Project rules mandate that every query include the org_id scope. Omitting it is a policy violation caught in code review. No server route queries across org boundaries.",
              },
              {
                layer: "Layer 3 · Computation",
                title: "FitScore scoped at compute time",
                body: "FitScore results (Purpose B5) are computed within the requesting org context and inserted with org_id bound at the point of write. The FitScore engine has no API surface that accepts a cross-org context. The archived PDF report-of-record is stored under the originating org storage path. A result produced for Agency A cannot be read by Agency B — RLS blocks the read at the database layer.",
              },
              {
                layer: "Layer 4 · Integration",
                title: "No external aggregation pool",
                body: "Pleks maintains no external data warehouse, analytics platform, or ML training dataset that aggregates applicant or tenant data across agencies. Each agency's data is a closed silo from ingest to deletion. A successful intrusion yields one agency's data — not a cross-agency pool, because the aggregation system does not exist.",
              },
            ].map((item) => (
              <div key={item.layer} style={{ border: "1px solid var(--rule)", borderRadius: "var(--r-sm)", padding: "16px 20px" }}>
                <p className="sc-eyebrow" style={{ marginBottom: 8 }}>{item.layer}</p>
                <p style={{ fontWeight: 500, marginBottom: 8, fontSize: 15 }}>{item.title}</p>
                <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {POPIA_PURPOSES.filter(p => p.id.startsWith("A")).map(p => (
          <div key={p.id} className="purpose-entry">
            <div className="purpose-hdr">
              <span className="purpose-id">{p.id}</span>
              <span>
                {p.title}
                {p.notDeployed && <span className="not-deployed">{p.notDeployedLabel ?? "Not deployed"}</span>}
              </span>
              <code className="purpose-slug">{p.slug}</code>
            </div>
            <div className="purpose-desc">{p.description}</div>
            <div className="purpose-meta">
              <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">{p.lawfulBasis}</span></div>
              <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">{p.data}</span></div>
              <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">{p.recipients}</span></div>
              <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">{p.retention}</span></div>
              <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">{p.crossBorder}</span></div>
              {p.dpia && <div className="pm-row"><span className="pm-k">DPIA</span><span className="pm-v">{p.dpia}</span></div>}
            </div>
          </div>
        ))}
      </section>

      {/* Part B */}
      <section id="part-b">
        <p className="sec-num"><span className="bar" /><span>B · Pleks as Operator</span></p>
        <h2 className="sec-h">Operator <span className="hl">purposes</span></h2>
        <p>
          These {MARKETING_FACTS.popiaPurposes.partB} purposes are those for which an agency using Pleks is the <strong>Responsible Party</strong> and Pleks is the
          Operator. Every purpose here is processed on behalf of the agency, under the lawful basis the agency holds for the processing,
          under ToS §09. <strong>Lawful basis caution: the basis shown for each purpose is the basis typically
          applied by agencies in the SA rental property management sector. It is not a determination by Pleks, and it does not bind
          any individual agency.</strong> An agency may operate on a different basis (e.g., relying on s11(1)(f) legitimate interest
          rather than s11(1)(b) contract for a given purpose). Each agency must confirm and document its own lawful basis in its own
          register. Where the agency relies on s11(1)(f) legitimate interest, it must conduct and retain a balancing test.
        </p>

        <div className="summary-card">
          <p className="sc-eyebrow">§02 Charter · Mandate mechanics</p>
          <p className="sc-h">No inbound rail — how rent collection works</p>
          <p>
            Pleks does not initiate payments. Rent collection runs through a DebiCheck or NAEDO mandate
            held between the tenant&rsquo;s bank and the agency&rsquo;s bank — Pleks is not a party to
            that mandate and holds no bank account numbers for this purpose. What Pleks does is read your
            bank statement after the collection run, match the incoming receipts to your trust ledger, and
            flag any mismatches. The {MARKETING_FACTS.popiaPurposes.partB} Operator purposes in this
            section reflect that reconciliation-observer role — not a payment-initiation role.
          </p>
        </div>

        {POPIA_PURPOSES.filter(p => p.id.startsWith("B")).map(p => (
          <div key={p.id} className="purpose-entry">
            <div className="purpose-hdr">
              <span className="purpose-id">{p.id}</span>
              <span>
                {p.title}
                {p.notDeployed && <span className="not-deployed">{p.notDeployedLabel ?? "Not deployed"}</span>}
              </span>
              <code className="purpose-slug">{p.slug}</code>
            </div>
            <div className="purpose-desc">{p.description}</div>
            <div className="purpose-meta">
              <div className="pm-row"><span className="pm-k">Lawful basis</span><span className="pm-v">{p.lawfulBasis}</span></div>
              <div className="pm-row"><span className="pm-k">Data</span><span className="pm-v">{p.data}</span></div>
              <div className="pm-row"><span className="pm-k">Recipients</span><span className="pm-v">{p.recipients}</span></div>
              <div className="pm-row"><span className="pm-k">Retention</span><span className="pm-v">{p.retention}</span></div>
              <div className="pm-row"><span className="pm-k">Cross-border</span><span className="pm-v">{p.crossBorder}</span></div>
              {p.dpia && <div className="pm-row"><span className="pm-k">DPIA</span><span className="pm-v">{p.dpia}</span></div>}
            </div>
          </div>
        ))}
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
            {OPERATORS.map(op => (
              <tr key={op.name}>
                <td className="op-name">{op.name}<span className="sub">{op.sub}</span></td>
                <td>{op.role}</td>
                <td>{op.domicile}</td>
                <td>{op.instrument}</td>
                <td>{op.purposesDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          This register is maintained as a living document. Every new processing purpose or new Operator introduced by a subsequent
          Pleks build specification requires an entry here before the feature ships. The version number increments on every material
          change (new purpose, new Operator, new cross-border transfer, retention period change, lawful basis change). Material changes
          also trigger a re-consent notification flow to affected agencies.
        </p>
        <p>
          For questions about this register or to exercise your rights as a data subject, contact our Information Officer — see §02 above.
          The data-processing obligations that give this register contractual force for Part B purposes are set out in{" "}
          <Link href="/terms#dataprocessing">section 09 of the Pleks Terms of Service</Link>. Agencies evaluating Pleks for procurement
          are encouraged to review ToS §09 alongside this register before contracting.
        </p>
      </section>
    </LegalPageLayout>
  )
}
