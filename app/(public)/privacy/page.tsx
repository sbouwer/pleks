/**
 * app/(public)/privacy/page.tsx — POPIA privacy notice for Pleks
 *
 * Route:  /privacy
 * Auth:   public
 */
import type { Metadata } from "next"
import Link from "next/link"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"
import { RETENTION_CATEGORIES } from "@/lib/legal/retention-categories"
import { OPERATORS } from "@/lib/legal/operators"

export const metadata: Metadata = {
  title: "Privacy Policy — Pleks",
  description: "How Pleks (Pty) Ltd collects, uses, stores and shares personal information — as Responsible Party for platform data and as Operator for agency-managed rental data.",
}

const SECTIONS = [
  { id: "who",           num: "01", label: "Who we are"              },
  { id: "collect",       num: "02", label: "What we collect"         },
  { id: "use",           num: "03", label: "How we use it"           },
  { id: "basis",         num: "04", label: "Lawful basis"            },
  { id: "share",         num: "05", label: "Who we share with"       },
  { id: "transfers",     num: "06", label: "Cross-border transfers"  },
  { id: "rights",        num: "07", label: "Your rights"             },
  { id: "retention",     num: "08", label: "Retention"               },
  { id: "security",      num: "09", label: "Security"                },
  { id: "breach",        num: "10", label: "Breach notification"     },
  { id: "subprocessors", num: "11", label: "Sub-processor changes"   },
  { id: "changes",       num: "12", label: "Changes to this policy"  },
  { id: "contact",       num: "13", label: "Contact"                 },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["POPIA · S22 · NOTICE", "plain language", LEGAL_VERSIONS.privacy]}
      titleBefore="Privacy"
      titleHighlight="policy"
      subtitle="How Pleks (Pty) Ltd collects, uses, stores and shares personal information — as Responsible Party for platform operations and as Operator for agency-managed rental data."
      kicker={[
        { label: "Last reviewed",  value: "2026 · 05 · 07", mono: true },
        { label: "Effective from", value: "2026 · 05 · 07", mono: true },
        { label: "Jurisdiction",   value: "Republic of South Africa" },
        { label: "Standards",      value: "POPIA · PAIA · CPA · NCA · RHA · FICA · PPA · STSMA" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel={`END · PRIVACY POLICY · ${LEGAL_VERSIONS.privacy}`}
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this policy means for you</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>Pleks processes personal information in two roles: as Responsible Party for platform operations (your account, billing, security) and as Operator on behalf of agencies for rental data (tenants, leases, applications).</span></li>
          <li><span className="b" /><span>We never sell personal information. Credit checks require explicit written consent before any bureau is queried. AI is used only as an assistive tool; humans make all decisions about tenants and applicants.</span></li>
          <li><span className="b" /><span>Most of your data stays in South Africa; some processing happens with US, EU, or Kenya operators under Standard Contractual Clauses as required by <span className="act-pill">POPIA · S72</span>.</span></li>
          <li><span className="b" /><span>Rejected applicant data is automatically purged 90 days after rejection — all records including identity documents, bank statements, and credit reports.</span></li>
          <li><span className="b" /><span>You have the full set of POPIA rights — including the right to complain to the Information Regulator independently of our response. See §07 and §13.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="who">
        <p className="sec-num"><span className="bar" /><span>01 · Identification</span></p>
        <h2 className="sec-h">Who <span className="hl">we are</span></h2>
        <p>
          Pleks is operated by <strong>Pleks (Pty) Ltd</strong>, a private company incorporated in the Republic of South Africa.
          We provide a property-management software-as-a-service platform to estate agencies, property practitioners, and landlords
          managing residential and commercial rental property in South Africa.
        </p>
        <p>
          Under <span className="act-pill">POPIA</span>, Pleks operates in two distinct roles:
        </p>
        <p>
          <strong>Pleks as Responsible Party — Part A (platform purposes).</strong> For data arising from the platform itself:
          authentication, multi-factor authentication, error monitoring, in-product feedback, uptime monitoring, cost and usage
          observability, the marketing waitlist, platform-level billing and subscriptions, support communications, audit logging,
          and platform administration. Pleks is the sole decision-maker about this processing and is accountable under POPIA for it.
        </p>
        <p>
          <strong>Pleks as Operator — Part B (agency purposes).</strong> For data arising from agency use of the platform: property
          portfolios, landlord relationships, tenant applications, credit checks, FitScore generation, lease generation and signing,
          rent invoicing, owner statements, rent ledgers and arrears, trust account reconciliation, deposit management, inspections,
          maintenance, critical incidents, tenant communications, supplier management, municipal bill processing, HOA/scheme management,
          document generation, AI-assisted processing, FICA/KYC documentation, and data-subject request handling. The agency is the
          Responsible Party for all this data; Pleks processes it on the agency&rsquo;s behalf under the data-processing terms set out
          in the Pleks <Link href="/terms">Terms of Service §09</Link>, which incorporates the written-contract requirements of{" "}
          <span className="act-pill">POPIA · S20</span>{" "}<span className="act-pill">POPIA · S21</span>.
        </p>
        <p>
          The full enumeration of every processing purpose, with lawful bases, data categories, retention periods, and operator
          recipients, is published in the{" "}
          <a href="/popia-register">Pleks POPIA Processing Register</a>. The Register is the authoritative inventory; this Privacy
          Policy is a plain-language summary of it.
        </p>
        <p>
          <strong>Where to direct your rights.</strong> For Part A data (your Pleks account, error events, billing records), exercise
          rights against Pleks directly. For Part B data (tenant or lease records held by an agency), exercise rights against the
          agency — they are the Responsible Party. Pleks routes misdirected requests to the correct party within 5 business days so
          the agency&rsquo;s 30-calendar-day response clock under POPIA s23 is preserved.
        </p>
        <p>
          <strong>Trust account framing.</strong> Pleks does not hold client funds. Trust money for rental management is held in the
          agency&rsquo;s own Section 86 trust account at the agency&rsquo;s own bank; Pleks is not a trustee and does not initiate payments.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>

      {/* 02 */}
      <section id="collect">
        <p className="sec-num"><span className="bar" /><span>02 · Data we collect</span></p>
        <h2 className="sec-h">What <span className="hl">we collect</span></h2>
        <p>
          The categories below summarise the personal information we process. Specific data fields by purpose are enumerated in the{" "}
          <a href="/popia-register">Processing Register</a>.
        </p>
        <ul className="legal-list">
          <li><strong>Account and authentication.</strong> Email address, password hash, session tokens, multi-factor authentication credentials (TOTP secret, passkey credential ID and public key), authentication event timestamps, IP address, user agent.</li>
          <li><strong>Identity (Part B).</strong> Full name, date of birth, South African ID or passport number, copies of identity documents where stored on behalf of an agency for FICA purposes.</li>
          <li><strong>Contact details.</strong> Email address, phone number, residential address, alternate contact details.</li>
          <li><strong>Banking details (Part B).</strong> Bank account, branch and clearing details, used only for trust-related transactions and owner payouts; masked in the UI and encrypted at the column level for operational use. Pleks does not store full tenant bank account numbers.</li>
          <li><strong>Credit information (Part B).</strong> Credit bureau reports, default records, civil judgments, credit score, affordability result, FitScore. Collected only with the applicant&rsquo;s explicit written consent under <span className="act-pill">POPIA · S11(1)(A)</span> and the Credit Bureau Code of Conduct (issued under POPIA, October 2020).</li>
          <li><strong>Employment and income (Part B).</strong> Pay slips, employer references, bank statements supplied during the application process.</li>
          <li><strong>Lease and tenancy data (Part B).</strong> Lease agreements, rent ledgers, payment history, deposit records, escalation history, notice history, lease-lifecycle events.</li>
          <li><strong>Communications content.</strong> Email messages, SMS and WhatsApp message bodies, in-app notifications, message templates and variants, delivery status, communication preferences.</li>
          <li><strong>Inspection records.</strong> Photos with EXIF data including GPS coordinates and timestamps (preserved for evidentiary purposes), room-by-room condition ratings, voice notes, AI-generated summaries.</li>
          <li><strong>Maintenance records.</strong> Issue descriptions, photos, contractor assignments, cost allocations, completion records.</li>
          <li><strong>Telemetry and security data.</strong> IP address, user agent, device fingerprint, error events (PII-scrubbed before transmission to Sentry), audit-log payloads showing before-and-after values of changed fields, authentication events.</li>
          <li><strong>Reference and household data.</strong> Names and contact details of references named by applicants; household members including minors named in applications, with bounded processing as set out below.</li>
        </ul>
        <p><strong>Special personal information (<span className="act-pill">POPIA · S26–S27</span>)</strong></p>
        <p>
          Pleks does not solicit special personal information as defined in POPIA s26 (religious or political beliefs, race or
          ethnic origin, trade-union membership, health or sex life, biometric information, criminal behaviour). Where it appears
          incidentally — for example, in free-text fields, photos, or reference comments — the agency, as Responsible Party, must
          hold a valid s27 ground for processing. Pleks&rsquo;s interfaces include contextual nudges discouraging the entry of special
          personal information in free-text fields. WebAuthn passkey authentication uses biometrics on your own device; the resulting
          credential is a cryptographic public key, not biometric information, and Pleks does not receive biometric data.
        </p>
        <p><strong>Children&rsquo;s personal information (<span className="act-pill">POPIA · S34–S35</span>)</strong></p>
        <p>
          Rental applications routinely list household members and dependants. Where any of these are under 18:
        </p>
        <ul className="legal-list">
          <li>The applicant submitting the form is treated as the competent person providing consent on the minor&rsquo;s behalf within the meaning of POPIA s34. Pleks relies on the applicant&rsquo;s representation that they are authorised to provide such consent.</li>
          <li>Processing of minors&rsquo; information is bounded strictly to housing-suitability necessity — establishing occupancy count and dependant-support obligations relevant to affordability.</li>
          <li>No credit check, identity verification, or marketing processing is performed against minor household members.</li>
        </ul>
        <p><strong>Reference contacts</strong></p>
        <p>
          References named by an applicant — landlords, employers, character references — are data subjects in their own right.
          The agency is contractually required under the Pleks <Link href="/terms">Terms of Service §09</Link> to send a{" "}
          <span className="act-pill">POPIA · S18</span> notice to each reference at the point of first contact, explaining that they
          have been named, what information will be requested, how long it will be retained, and how to exercise their rights. Pleks
          provides a template notice and the platform&rsquo;s communication log makes compliance auditable. Pleks does not independently
          verify that such notice has been provided and relies on the agency&rsquo;s compliance with this obligation.
        </p>
      </section>

      {/* 03 */}
      <section id="use">
        <p className="sec-num"><span className="bar" /><span>03 · Lawful processing</span></p>
        <h2 className="sec-h">How <span className="hl">we use it</span></h2>
        <p>
          We process personal information for the purposes summarised below. The full enumeration with lawful bases and data
          categories is in the <a href="/popia-register">Processing Register</a>.
        </p>
        <ul className="legal-list">
          <li><strong>Platform operations (Part A).</strong> Account creation and maintenance, authentication, security telemetry and fraud prevention, error monitoring (with PII scrubbed before transmission), uptime probes, cost and usage observability, audit logging, platform administration.</li>
          <li><strong>Application and screening (Part B).</strong> Receiving rental applications, processing application fees, verifying identity and income, running credit checks with explicit consent, generating FitScore, supporting agency shortlist and decision workflows.</li>
          <li><strong>Lease lifecycle (Part B).</strong> Generating, signing, and storing lease documents; tracking lease state, escalations, amendments, notices, and terminations; producing <span className="act-pill">CPA · S14</span> auto-renewal notices for fixed-term agreements where CPA applies (40–80 business days before expiry per CPA s14(2)(d)).</li>
          <li><strong>Communications and notifications (Part B).</strong> Sending mandatory notices required by <span className="act-pill">RHA</span> and <span className="act-pill">CPA</span>, and transactional notifications relating to rent, deposits, inspections, maintenance, and tenancy events, via WhatsApp (primary), SMS (backup), and email.</li>
          <li><strong>Financial and trust (Part B).</strong> Maintaining the rent ledger, reconciling the agency&rsquo;s Section 86 trust account, generating owner statements, managing arrears and letters of demand, recording deposit transactions and interest, producing PPRA-compliant audit exports.</li>
          <li><strong>FICA and KYC storage (Part B).</strong> Storing FICA documentation on behalf of agencies that are Accountable Institutions under the Financial Intelligence Centre Act <span className="act-pill">FICA</span>. Pleks does not perform FICA verification — it provides secure storage and workflow tooling for the agency&rsquo;s own compliance.</li>
          <li><strong>Subject-rights handling.</strong> Routing access, correction, deletion, objection, and reconsideration requests to the correct Responsible Party (Pleks for Part A, agency for Part B), and supporting the agency&rsquo;s 30-calendar-day response under POPIA s23.</li>
          <li><strong>Compliance with law.</strong> Statutory record retention (Tax Administration Act s29, FICA s23, PPA s54 + Reg 33, Companies Act s24), audit-log retention for accountability under <span className="act-pill">POPIA · S17</span>, breach notification under POPIA s21–s22.</li>
        </ul>
        <p><strong>AI-assisted processing</strong></p>
        <p>
          Pleks uses bounded, assistive AI across multiple workflows — income extraction from bank statements, FitScore rationale,
          maintenance triage, deposit-deduction justification, lease-clause conflict checking, arrears-letter drafting,
          wear-and-tear assessment, municipal bill extraction, AGM notice drafting, and trust audit narrative. The AI model
          provider is listed in the <a href="/popia-register">Processing Register</a>.
        </p>
        <p>
          FitScore is a rules-based and data-weighted scoring tool that may incorporate AI-assisted analysis (for example, in
          generating the human-readable rationale that accompanies the score), but the score itself is computed by a deterministic
          weighting of inputs — credit results, verified income, rental history, and employment stability. FitScore does not
          constitute automated decision-making within the meaning of <span className="act-pill">POPIA · S71</span>.
          FitScore outputs are advisory signals only and may not be used as the sole basis for approval, rejection, or
          adverse treatment of an applicant.
        </p>
        <p>
          AI is assistive only. Pleks does not make solely automated decisions that produce legal effects or similarly significant effects about tenants or applicants without meaningful human review — all decisions remain with
          the agency or landlord. The AI model provider operates under an Enterprise DPA configured for no model-training retention and minimal operational retention: Pleks does not intentionally retain prompts or responses beyond the workflow output required for the underlying purpose. PII minimisation is applied before
          cross-border transfer; structured context may remain reasonably linkable to an individual and constitutes pseudonymised,
          not anonymised, personal information under POPIA s1, governed by Standard Contractual Clauses under POPIA s72. Re-identification remains reasonably possible when combined with additional organisational context held by Pleks or the agency.
        </p>
      </section>

      {/* 04 */}
      <section id="basis">
        <p className="sec-num"><span className="bar" /><span>04 · Lawful bases</span></p>
        <h2 className="sec-h">Lawful <span className="hl">basis</span></h2>
        <p>
          The lawful bases under which Pleks processes personal information vary by purpose. The full per-purpose mapping is in
          the <a href="/popia-register">Processing Register</a>. Where multiple lawful bases are listed, Pleks and/or the agency rely primarily on the basis most directly connected to the processing activity, with additional bases applying only where independently necessary. The principal bases are:
        </p>
        <p><strong>For Part A (Pleks as Responsible Party):</strong></p>
        <ul className="legal-list">
          <li><span className="act-pill">POPIA · S11(1)(B)</span> — necessary for performance of the contract between Pleks and the platform user (the Terms of Service). Used for authentication, account management, billing, support.</li>
          <li><span className="act-pill">POPIA · S11(1)(C)</span> — compliance with an obligation imposed by law. Used for security safeguards under POPIA s19, FICA-related storage on behalf of agencies, tax-record retention.</li>
          <li><span className="act-pill">POPIA · S11(1)(F)</span> — necessary for the legitimate interests of Pleks or a third party. Used for error monitoring, uptime probes, cost observability, audit logging, and platform administration. A balancing test is conducted and documented for each purpose relying on this basis.</li>
          <li><span className="act-pill">POPIA · S11(1)(A)</span> — explicit consent. Used for the marketing waitlist, optional MFA for non-agent users, and other opt-in processing.</li>
        </ul>
        <p><strong>For Part B (Pleks as Operator):</strong></p>
        <p>
          The agency holds the lawful basis. The basis typically applied by agencies in the South African rental-property-management
          sector is shown in the Processing Register. Each agency must confirm and document its own basis in its own register,
          including any balancing test required where POPIA s11(1)(f) is invoked.
        </p>
        <p><strong>For credit checks specifically:</strong></p>
        <p>
          The lawful basis is <span className="act-pill">POPIA · S11(1)(A)</span> explicit consent, supported by compliance with
          the Credit Bureau Code of Conduct issued under POPIA in October 2020, and the contractual terms imposed by Searchworx and
          the underlying credit bureaus. The National Credit Act establishes the regulatory framework under which credit bureaus
          operate (<span className="act-pill">NCA · S43–S46</span>) but does not itself impose the consent requirement — that flows
          from POPIA and the Credit Bureau Code.
        </p>
      </section>

      {/* 05 */}
      <section id="share">
        <p className="sec-num"><span className="bar" /><span>05 · Operators &amp; sub-processors</span></p>
        <h2 className="sec-h">Who <span className="hl">we share with</span></h2>
        <p>
          We share personal information only with operators who help us deliver the platform. We do not sell personal information.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "28%" }}>Party</th>
              <th>Purpose &amp; location</th>
              <th style={{ width: "28%" }}>Transfer mechanism</th>
            </tr>
          </thead>
          <tbody>
            {OPERATORS.filter(op => op.surfaceInShareTable).map(op => (
              <tr key={op.name}>
                <td className="who">{op.name}<span className="sub">{op.shareTableSub ?? op.sub}</span></td>
                <td>{op.shareTablePurpose}</td>
                <td>{op.shareTableTransfer}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          GitHub is used for source-code hosting. It processes contributor identities (commit author records) only; no customer
          personal information is stored in source code.
        </p>
        <p>
          Operators outside South Africa process personal information under Standard Contractual Clauses incorporated into the
          relevant Data Processing Addendum, as required by{" "}
          <span className="act-pill">POPIA · S72(1)(A)</span>. Operators domiciled in South Africa (PayFast, Searchworx, DocuSeal
          on Hetzner SA) are domestic processors and no cross-border transfer occurs.
        </p>
        <p>
          <strong>POPIA role distinction.</strong> Most parties in the table above act as Operators or sub-processors processing
          personal information on Pleks&rsquo;s behalf. However, PayFast (as payment processor), Searchworx and the underlying
          credit bureaus (as credit information providers), and Meta (as an independent platform operator) may in certain
          contexts act as independent Responsible Parties for their own processing activities. Pleks does not control that
          independent processing and each party&rsquo;s own privacy policy governs it. The Processing Register identifies
          the applicable POPIA role for each party.
        </p>
      </section>

      {/* 06 */}
      <section id="transfers">
        <p className="sec-num"><span className="bar" /><span>06 · Cross-border transfers</span></p>
        <h2 className="sec-h">Cross-border <span className="hl">transfers</span></h2>
        <p>
          <span className="act-pill">POPIA · S72(1)(A)</span> permits cross-border transfers where the recipient is subject to a
          binding agreement providing an adequate level of protection substantially similar to POPIA. Pleks relies on appropriate
          contractual safeguards, including SCC-style data-transfer provisions, as the principal mechanism for all transfers
          outside South Africa.
        </p>
        <ul className="legal-list">
          <li><strong>Africa&rsquo;s Talking</strong> is also subject to the Kenya Data Protection Act 2019; SCCs are applied as the primary mechanism in addition to that local-law protection.</li>
          <li><strong>Anthropic</strong> AI processing is governed by SCCs supplemented by a zero-retention Enterprise DPA — API inputs and outputs are not retained for model training or any other purpose beyond returning the immediate response; operational retention by the provider is minimised under the Enterprise DPA. Pleks does not intentionally retain prompts or responses beyond the workflow output required for the underlying purpose.</li>
          <li><strong>US-domiciled operators</strong> (Supabase, Vercel, Sentry, Resend, Better Stack, Meta) operate under Standard Contractual Clauses incorporated into their respective Data Processing Addenda.</li>
          <li><strong>Contract-necessity backstop.</strong> In limited cases, transfers may also occur where necessary for the performance of a contract with the data subject, as permitted by <span className="act-pill">POPIA · S72(1)(C)</span>. This is a backstop basis; SCCs remain Pleks&rsquo;s primary mechanism.</li>
        </ul>
        <p>
          Pleks evaluates each cross-border transfer against <span className="act-pill">POPIA · S72</span> before contracting with
          the operator, and re-evaluates on operator change.
        </p>
      </section>

      {/* 07 */}
      <section id="rights">
        <p className="sec-num"><span className="bar" /><span>07 · Data subject rights</span></p>
        <h2 className="sec-h">Your <span className="hl">rights</span></h2>
        <p>
          Every data subject has the following rights under POPIA. For Part B data (tenant or lease records held by an agency),
          exercise rights against the agency. For Part A data (your Pleks account), exercise rights against Pleks directly.
          Pleks supports the agency&rsquo;s response and routes misdirected requests within 5 business days.
        </p>
        <ul className="legal-list">
          <li>
            <strong>Right of access (<span className="act-pill">POPIA · S23</span>).</strong> Request a copy of the personal
            information we hold about you, the categories of recipients, the source, and the purpose. Self-service access via
            Settings &rarr; Data &amp; Privacy within the platform is immediate for profile data and most account records. Other
            records: contact the Information Officer. Formal PAIA requests: use Form 2. We respond within 30 calendar days,
            extendable per PAIA s26 with written notice.
          </li>
          <li>
            <strong>Right to correction (<span className="act-pill">POPIA · S24</span>).</strong> Request correction or deletion
            of inaccurate, misleading, outdated, incomplete, or unlawfully obtained personal information, and notification to
            third parties to whom the information was disclosed.
          </li>
          <li>
            <strong>Right to deletion or restriction (<span className="act-pill">POPIA · S25</span>).</strong> Request destruction
            or deletion of personal information that Pleks is no longer authorised to retain. Statutory retention obligations may
            prevent deletion during the applicable retention window; Pleks will explain the basis for any retention that continues
            past a deletion request. If you are not satisfied with the response, you may apply to the Information Regulator under
            s74 or to court under s99.
          </li>
          <li>
            <strong>Right to object (<span className="act-pill">POPIA · S11(3)</span>).</strong> Where Pleks&rsquo;s lawful basis
            is legitimate interest under POPIA s11(1)(f), you may object on reasonable grounds relating to your particular
            situation. Pleks will cease the relevant processing unless we can demonstrate compelling legitimate grounds that override
            your interests, or unless processing is necessary for the exercise or defence of legal claims.
          </li>
          <li>
            <strong>Automated-decision rights (<span className="act-pill">POPIA · S71</span>).</strong> Pleks does not make
            automated decisions about applicants or tenants that produce legal or similarly significant effects. FitScore is an
            assistive tool — final tenancy decisions remain with the agency or landlord. If you believe an automated decision was
            nonetheless taken, you have the right under s71(2) to make representations to the agency and to receive information
            about the underlying logic of the decision.
          </li>
          <li>
            <strong>Direct-marketing opt-out (<span className="act-pill">POPIA · S69</span> / s11(3)).</strong> Where Pleks sends
            you direct marketing, you may opt out at any time via the unsubscribe link in every message or by contacting the
            Information Officer. Opt-outs are honoured within 5 business days.
          </li>
          <li>
            <strong>Right to withdraw consent.</strong> Where consent is the lawful basis (waitlist marketing, optional MFA,
            credit checks), you may withdraw at any time. Withdrawal does not affect the lawfulness of processing that occurred
            before withdrawal. For credit checks, once a bureau query has been submitted, consent cannot retrospectively unwind
            that query, but you may withdraw consent for any future checks and may object to further use of an already-obtained
            result subject to retention obligations.
          </li>
          <li>
            <strong>Right to complain (<span className="act-pill">POPIA · S74</span>).</strong> You may lodge a complaint with the
            Information Regulator at any time, independently of Pleks&rsquo;s or the agency&rsquo;s response. Contact details are
            in §13.
          </li>
        </ul>
        <p>
          Many rights — particularly access to account records, profile correction, marketing opt-out, and consent log inspection
          — can be exercised directly in Settings &rarr; Data &amp; Privacy within the platform. All other requests should be sent
          to the Information Officer at{" "}
          <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>. Formal PAIA requests may be refused where POPIA, privilege, confidentiality obligations,
          or statutory exemptions apply; Pleks will state the basis for any refusal in writing.
        </p>
      </section>

      {/* 08 */}
      <section id="retention">
        <p className="sec-num"><span className="bar" /><span>08 · Retention schedule</span></p>
        <h2 className="sec-h">How long <span className="hl">we keep it</span></h2>
        <p>
          We retain personal information only as long as necessary for the purpose for which it was collected, or as required by
          law. Where multiple retention periods apply to the same record, we enforce the longest applicable statutory, contractual,
          or evidentiary period. Subject-initiated erasure does not remove records subject to active legal hold or accountability
          documentation under POPIA s17. Retention windows in this table reflect Pleks platform defaults and sector-standard compliance guidance for Part B categories; agencies remain responsible for determining whether different lawful retention periods apply to their own obligations.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "36%" }}>Category</th>
              <th style={{ width: "22%" }}>Retention</th>
              <th>Legal basis</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION_CATEGORIES.map((cat) => (
              <tr key={`${cat.category}-${cat.subLabel}`}>
                <td className="who">
                  {cat.category}
                  {cat.subLabel ? <span className="sub">{cat.subLabel}</span> : null}
                </td>
                <td>{cat.retention}</td>
                <td>{cat.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Purpose-level retention periods in this table are minimum commitments and may be overridden by mandatory statutory
          retention, active legal holds, subject-request restrictions, ongoing disputes, or subpoenas.
        </p>
      </section>

      {/* 09 */}
      <section id="security">
        <p className="sec-num"><span className="bar" /><span>09 · Security &amp; transfer</span></p>
        <h2 className="sec-h">How <span className="hl">we protect it</span></h2>
        <p>
          Pleks implements appropriate technical and organisational measures consistent with{" "}
          <span className="act-pill">POPIA · S19</span>. Key measures include:
        </p>
        <ul className="legal-list">
          <li><strong>Encryption in transit:</strong> TLS 1.3 for all connections; HSTS enforced; no plaintext fallback.</li>
          <li><strong>Encryption at rest:</strong> AES-256 at the database layer; sensitive fields (bank account numbers, TOTP secrets, passkey credentials) additionally encrypted at the column level before INSERT, so raw values are never visible to infrastructure operators or in database dumps.</li>
          <li><strong>Row-Level Security:</strong> Row-level access controls are enforced across production application data stores containing personal information; service-role access restricted to server-side only with org-scoped gateway helper; administrative access is restricted by role separation and least-privilege principles.</li>
          <li><strong>Authentication:</strong> magic-link auth for tenant/landlord/supplier roles; password + mandatory MFA for agent roles; MFA step-up required for fiduciary-class actions.</li>
          <li><strong>Immutable audit logging:</strong> every state-changing operation recorded with actor, target, event type, timestamp, IP address, and change payload. The audit log is designed to be append-only and operationally immutable within the application layer, and is protected against ordinary alteration or deletion.</li>
          <li><strong>PII scrubbing for observability:</strong> error monitoring and log aggregation tools receive PII-scrubbed events only; the scrubber runs pre-transmission and strips request bodies from sensitive routes and PII patterns from all payloads.</li>
          <li><strong>Signed URLs with TTL:</strong> all sensitive downloads use time-limited signed URLs; no public bucket access to customer data.</li>
          <li><strong>Operator contractual controls:</strong> every third-party operator operates under a Data Processing Addendum with Standard Contractual Clauses where cross-border, and documented retention and breach-notification terms.</li>
        </ul>
      </section>

      {/* 10 */}
      <section id="breach">
        <p className="sec-num"><span className="bar" /><span>10 · Breach notification</span></p>
        <h2 className="sec-h">Breach <span className="hl">notification</span></h2>
        <p>
          <strong>Pleks as Operator (Part B).</strong> Where Pleks becomes aware of a security compromise affecting agency data,
          Pleks will notify the agency <strong>without undue delay</strong> — targeting notification within 72 hours where reasonably practicable, subject to reasonable verification and containment activities, as a commitment exceeding the POPIA s21 statutory baseline — of becoming aware of any personal information breach affecting Part B data. The agency must then independently assess whether its
          own <span className="act-pill">POPIA · S22</span> obligations to notify the Information Regulator and affected data subjects
          are triggered. The 72-hour target is a Pleks self-imposed standard; POPIA s21 requires only &ldquo;without undue delay.&rdquo;
        </p>
        <p>
          <strong>Pleks as Responsible Party (Part A).</strong> Where a security compromise affects personal information for which
          Pleks is the Responsible Party, Pleks will notify the Information Regulator and affected data subjects as soon as
          reasonably possible, in accordance with <span className="act-pill">POPIA · S22</span>.
        </p>
        <p>
          In all cases, Pleks will maintain a written record of the breach, the steps taken in response, and the rationale for any
          decision not to notify a particular individual.
        </p>
      </section>

      {/* 11 */}
      <section id="subprocessors">
        <p className="sec-num"><span className="bar" /><span>11 · Sub-processor changes</span></p>
        <h2 className="sec-h">Sub-processor <span className="hl">authorisation</span></h2>
        <p>
          Pleks uses general written authorisation from agencies for the operators listed in §05 of this Privacy Policy and §C
          of the Processing Register, consistent with{" "}
          <span className="act-pill">POPIA · S21(2)</span> and industry practice.
        </p>
        <p>
          When Pleks proposes to change an operator in a way that materially affects agencies&rsquo; data, Pleks will notify
          agencies by email to their registered address at least 30 days before the change takes effect, giving agencies a
          reasonable right to object in writing. Changes that do not materially affect data processing — for example, infrastructure
          migration within the same legal entity or jurisdiction — are recorded in the Register&rsquo;s version history without
          the 30-day window.
        </p>
        <p>
          The current operator list is maintained in §05 above and in §C of the{" "}
          <a href="/popia-register">Processing Register</a>, and updated on every version increment.
        </p>
      </section>

      {/* 12 */}
      <section id="changes">
        <p className="sec-num"><span className="bar" /><span>12 · Changes to this policy</span></p>
        <h2 className="sec-h">How we <span className="hl">update this</span></h2>
        <p>
          This Privacy Policy is a living document. Material changes — new processing purpose, new operator, new cross-border
          transfer, retention-period change, lawful-basis change — trigger a version bump and a re-consent notification flow to
          affected agencies and, where appropriate, individual data subjects.
        </p>
        <p>
          Non-material changes (typographical corrections, structural clarifications, consistency corrections) are recorded in the
          version history but do not trigger re-consent.
        </p>
        <p>
          If an inconsistency exists between this Privacy Policy and the Pleks Terms of Service, the Terms of Service
          prevail unless mandatory law requires otherwise.
        </p>
        <p>
          The current version is always available at{" "}
          <a href="/privacy">pleks.co.za/privacy</a>. Version history is maintained alongside the Processing Register.
        </p>
      </section>

      {/* 13 */}
      <section id="contact">
        <p className="sec-num"><span className="bar" /><span>13 · Contact &amp; complaints</span></p>
        <h2 className="sec-h">Contact <span className="hl">us</span></h2>
        <p>
          For any question about this policy, the data we hold, or to exercise your rights, contact our Information Officer.
          The head of the private body for the purposes of <span className="act-pill">PAIA · S51(1)(A)</span> is the same person,
          who also serves as Information Officer under <span className="act-pill">POPIA · S55</span>.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer · Pleks (Pty) Ltd
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a> · Western Cape, South Africa</span>
          </span>
        </div>
        <p>
          You may lodge a complaint with the Information Regulator at any time, independently of Pleks&rsquo;s or the
          agency&rsquo;s response. Pleks will not retaliate against any data subject for exercising this right.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />Regulator</span>
          <span className="v">
            Information Regulator of South Africa
            <br /><span className="sub">
              JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001 · 010 023 5207 ·{" "}
              <ExtLink href={EXTERNAL_LINKS.informationRegulator}>inforegulator.org.za</ExtLink>
              {" "}· <a href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a>
            </span>
          </span>
        </div>
        <p>
          For formal PAIA access requests, see the Pleks <a href="/paia-manual">PAIA Manual</a>.
        </p>
      </section>
    </LegalPageLayout>
  )
}
