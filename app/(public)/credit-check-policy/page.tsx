/**
 * app/(public)/credit-check-policy/page.tsx — credit check policy for rental applicants
 *
 * Route:  /credit-check-policy
 * Auth:   public
 * Notes:  Referenced from the applicant consent screen during application flow.
 */
import type { Metadata } from "next"
import Link from "next/link"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"

export const metadata: Metadata = {
  title: "Credit Check Policy — Pleks",
  description: "How Pleks runs credit and background checks on rental applicants, and your rights as a data subject under POPIA and the NCA.",
}

const SECTIONS = [
  { id: "what",       num: "01", label: "What checks are run"     },
  { id: "who",        num: "02", label: "Who runs the checks"     },
  { id: "fee",        num: "03", label: "Fee"                     },
  { id: "popia",      num: "04", label: "Legal basis under POPIA" },
  { id: "rights",     num: "05", label: "Your rights"             },
  { id: "withdrawal", num: "06", label: "Withdrawal of consent"   },
  { id: "retention",  num: "07", label: "Retention"               },
]

export default function CreditCheckPolicyPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["POPIA · S11(1)(A) · CONSENT", "applicants", LEGAL_VERSIONS.creditCheckPolicy]}
      titleBefore="Credit check"
      titleHighlight="policy"
      subtitle="How credit and background checks work on Pleks, what the application fee covers, and the rights you hold as a data subject under POPIA and the National Credit Act."
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 05", mono: true },
        { label: "In force from",  value: "2026 · 05 · 05", mono: true },
        { label: "Conducted by",   value: "Searchworx (Pty) Ltd" },
        { label: "Acts",           value: "POPIA · NCA · Credit Bureau Code of Conduct" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel={`END · CREDIT CHECK POLICY · ${LEGAL_VERSIONS.creditCheckPolicy}`}
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this means for you as an applicant</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>No credit check will ever be run without your explicit written consent — this is a requirement under POPIA s11(1)(a) and the Credit Bureau Code of Conduct.</span></li>
          <li><span className="b" /><span>The application fee is paid by you (the applicant) — the agency using Pleks does not pay for your check.</span></li>
          <li><span className="b" /><span>Checks are run by a registered credit bureau intermediary (identified in section 02). Pleks initiates the check on behalf of the agency, stores the result, and generates a derivative FitScore — it acts as an Operator under the agency&rsquo;s instruction.</span></li>
          <li><span className="b" /><span>You have the right to receive a free copy of the credit report generated for your application, to correct inaccuracies, and to lodge a complaint with the Information Regulator.</span></li>
          <li><span className="b" /><span>Declined application results are automatically purged after 90 days — all associated records including identity documents and bank statements. Credit check results tied to an active lease are retained for 5 years post-termination.</span></li>
          <li><span className="b" /><span>Credit checks are not performed on minors. If your application includes household members under 18, no bureau query is run for them.</span></li>
          <li><span className="b" /><span>If you do not consent to the credit check, your application cannot proceed to Stage 2. You retain the right to apply through another channel that does not require a credit check.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="what">
        <p className="sec-num"><span className="bar" /><span>01 · Scope of checks</span></p>
        <h2 className="sec-h">What checks <span className="hl">are run</span></h2>
        <p>
          When you apply for a rental property through Pleks, a comprehensive background and credit check is performed as part of
          the Stage 2 application process. These checks query the following sources:
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "35%" }}>Bureau / source</th>
              <th>What is checked</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">TransUnion<span className="sub">credit bureau</span></td>
              <td>Credit profile, payment history, accounts in arrears, judgements.</td>
            </tr>
            <tr>
              <td className="who">Experian<span className="sub">credit bureau</span></td>
              <td>Credit profile, payment behaviour, adverse listings, judgements.</td>
            </tr>
            <tr>
              <td className="who">Compuscan<span className="sub">credit bureau</span></td>
              <td>Credit bureau records, behavioural scoring, payment history, and adverse listings.</td>
            </tr>
            <tr>
              <td className="who">XDS<span className="sub">credit bureau</span></td>
              <td>Credit bureau records, default listings, adverse payment behaviour.</td>
            </tr>
            <tr>
              <td className="who">TPN Credit Bureau<span className="sub">rental bureau</span></td>
              <td>Tenant payment performance data specific to the rental market.</td>
            </tr>
            <tr>
              <td className="who">Home Affairs (DHA)<span className="sub">identity verification</span></td>
              <td>Identity match — verification that the supplied ID number corresponds to the supplied name and date of birth. No biometric data (fingerprints, face scans) is captured or stored by Pleks or the service provider in this check.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The results of these checks form part of your <strong>FitScore</strong>{" "}— a weighted applicant rating that the agency uses
          to evaluate your suitability for the property. FitScore combines bureau data with income affordability and employment
          verification. No single factor is automatically disqualifying.
        </p>
        <p>
          <strong>Automated decisions:</strong>{" "}Pleks does not make automated decisions about applicants. FitScore is assistive only
          — the agency or landlord reviews the underlying data and makes the final tenancy decision. No outcome is triggered
          automatically by any score threshold. POPIA s71(1) prohibits automated decisions with legal or material consequences
          except in limited circumstances; Pleks does not rely on any of those exceptions. If you believe an automated decision was
          nonetheless taken, your <span className="act-pill">POPIA · S71(2)</span> rights apply: you may make representations to
          the agency and request the underlying logic of the decision. Contact our Information Officer.
        </p>
        <p>
          <strong>Minors:</strong>{" "}Credit checks are not performed on minors. If your application includes household members under 18,
          no bureau query is run for them.
        </p>
      </section>

      {/* 02 */}
      <section id="who">
        <p className="sec-num"><span className="bar" /><span>02 · Service provider</span></p>
        <h2 className="sec-h">Who runs <span className="hl">the checks</span></h2>
        <p>
          All credit and background checks are conducted by <strong>Searchworx (Pty) Ltd</strong>, a registered credit bureau
          intermediary regulated under the National Credit Act 34 of 2005 (ss 43–46) and the Credit Bureau Code of Conduct issued
          under POPIA (October 2020). Pleks initiates the credit check on instruction of the agency, receives the report from the
          service provider, stores it on its infrastructure, generates a derivative FitScore (B5 of the POPIA processing register), and
          makes the result available to the agency. Throughout, Pleks acts as an Operator on behalf of the agency under the data-processing
          terms in the Pleks <Link href="/terms">Terms of Service §09</Link>; the agency is the Responsible Party for the application data.
          Credit check results are made available to the agency for the sole purpose of evaluating your application. Where an agency
          manages the property, the agency is the Responsible Party and the landlord receives the result only on the agency&rsquo;s
          instruction. Where a landlord uses Pleks directly without an agency, the landlord is the Responsible Party for the
          application data.
        </p>
        <div className="officer-card">
          <span className="l">Service<br />provider</span>
          <span className="v">
            Searchworx (Pty) Ltd
            <br /><span className="sub">Registered credit bureau intermediary · NCA ss 43–46</span>
          </span>
        </div>
        <p>
          The service provider is bound by its own regulatory obligations regarding the handling of your personal information, including
          obligations under the <span className="act-pill">NCA</span>, the <span className="act-pill">POPIA</span>, the Credit Bureau
          Code of Conduct, and the Financial Intelligence Centre Act (FICA) as an accountable institution.
        </p>
      </section>

      {/* 03 */}
      <section id="fee">
        <p className="sec-num"><span className="bar" /><span>03 · Application fee</span></p>
        <h2 className="sec-h">The <span className="hl">application fee</span></h2>
        <p>
          A once-off application fee is charged per credit check bundle. This fee covers all bureau queries listed in
          section 01 and is paid by the applicant at the time of progressing to Stage 2 of the application.
          The current fee is displayed on the application screen before you are asked to pay. Your explicit consent
          and payment are obtained simultaneously — bureau queries are only executed after both have been confirmed.
        </p>
        <ul className="legal-list">
          <li>The fee is non-refundable once the credit check process has been initiated, as third-party bureau queries are executed immediately and cannot be reversed. If the bureau query fails for technical reasons before any report is generated, the fee is refunded in full.</li>
          <li>The fee is paid directly by the applicant — the agency using Pleks does not pay for your check.</li>
          <li>Joint applications (two applicants on one lease) are charged a higher bundled fee, also shown before payment. Each joint applicant must complete the consent process individually — one applicant cannot consent on behalf of the other. Credit checks for joint applicants are run separately; results are made available to the agency for evaluation but are not disclosed between applicants.</li>
          <li>If your application is withdrawn before Stage 2, no fee is charged — credit checks are only triggered when you choose to proceed.</li>
        </ul>
      </section>

      {/* 04 */}
      <section id="popia">
        <p className="sec-num"><span className="bar" /><span>04 · Legal basis</span></p>
        <h2 className="sec-h">Legal basis <span className="hl">under POPIA</span></h2>
        <p>
          Credit checks are processed on the basis of your <strong>explicit consent</strong>{" "}under{" "}
          <span className="act-pill">POPIA · S11(1)(a)</span> and the Credit Bureau Code of Conduct issued under POPIA (October 2020).
          Before any check is initiated, you will be asked to read this policy and provide your informed consent via a signed digital
          consent form — no check will be performed without it. The NCA establishes the regulatory framework for credit bureaus (ss 43–46)
          and your right to access and challenge credit records (<span className="act-pill">NCA · S72</span>), but does not itself impose
          the consent requirement for bureau enquiries — that flows from POPIA and the Credit Bureau Code. NCA s69 establishes the
          National Register of Credit Agreements and is not the basis for bureau enquiries.
        </p>
        <p>
          <strong>Consequences of not consenting:</strong>{" "}If you do not consent to the credit check, your application cannot proceed to
          Stage 2. The agency may decline your application on that basis. You retain the right to apply through another channel that
          does not require a bureau check, including agencies that use different screening methods. Under <span className="act-pill">POPIA · S18</span>,
          you are entitled to know these consequences before deciding whether to consent.
        </p>
        <p>
          Pleks retains a timestamped record of your consent in our audit log for accountability purposes, as required by{" "}
          <span className="act-pill">POPIA · S17</span> (Documentation). You may request a copy of your consent records by contacting our
          Information Officer.
        </p>
      </section>

      {/* 05 */}
      <section id="rights">
        <p className="sec-num"><span className="bar" /><span>05 · Your rights</span></p>
        <h2 className="sec-h">Your <span className="hl">rights</span></h2>
        <p>As the subject of a credit check, you have the following rights under South African law:</p>
        <ul className="legal-list">
          <li><strong>Right of access (POPIA s23).</strong>{" "}Request a copy of the personal information Pleks holds about you, including the credit report and FitScore generated for your application. A free copy of the report is available on request — contact our Information Officer.</li>
          <li><strong>Right to correction (POPIA s24).</strong>{" "}Request correction or deletion of inaccurate, misleading, outdated, or incomplete personal information held by Pleks. Contact our Information Officer or use the in-platform subject-rights dashboard.</li>
          <li><strong>Right to deletion / restriction (POPIA s25).</strong>{" "}Request destruction or deletion of personal information Pleks is no longer authorised to retain. Statutory retention obligations (see §07) may prevent immediate deletion; Pleks will explain any basis for retention that continues after a request.</li>
          <li><strong>Right to object (POPIA s11(3)).</strong>{" "}Where any processing relies on legitimate interest, you may object on grounds relating to your particular situation. Credit check processing relies on s11(1)(a) consent — so withdrawal of consent (§06) is the primary mechanism; objection under s11(3) applies to any downstream legitimate-interest processing such as the AI-assisted rationale narrative generated alongside FitScore.</li>
          <li><strong>Bureau dispute (NCA s72).</strong>{" "}If you believe information in the report is inaccurate, you may lodge a dispute directly with the relevant bureau. Bureaus are required to investigate and respond within 20 business days. Contact details: TransUnion 0861 482 482; Experian 0861 105 665; Compuscan 0861 514 131; XDS 0860 937 000; TPN 0861 876 000.</li>
          <li><strong>Automated-decision rights (POPIA s71(2)).</strong>{" "}Pleks does not make automated decisions about applicants (see §01). If you believe an automated decision was nonetheless taken, you may make representations to the agency and request the underlying logic of the decision. Contact our Information Officer to initiate this.</li>
          <li><strong>Complaint to the Information Regulator.</strong>{" "}You may lodge a complaint about data handling with the <ExtLink href={EXTERNAL_LINKS.informationRegulator}>Information Regulator</ExtLink> under POPIA s74, or apply to court under s99, at any time — independently of any response from Pleks or the agency.</li>
        </ul>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>

      {/* 06 */}
      <section id="withdrawal">
        <p className="sec-num"><span className="bar" /><span>06 · Withdrawal of consent</span></p>
        <h2 className="sec-h">Withdrawing <span className="hl">consent</span></h2>
        <p>
          Once a credit check has been initiated and the bureau queries submitted, consent cannot be retrospectively withdrawn for
          that specific check — the data has already been accessed and a report generated. This is an inherent limitation of the
          bureau query process, not a choice made by Pleks.
        </p>
        <p>
          You may, however, <strong>withdraw consent for any future checks or processing of your information</strong>{" "}by contacting
          us at <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>. Withdrawal of consent for future processing will not
          affect the lawfulness of processing that occurred before withdrawal. Withdrawal of consent will:
        </p>
        <ul className="legal-list">
          <li>(a) prevent any future bureau queries being run against your records;</li>
          <li>(b) require the agency to suspend further use of the existing report in evaluating your application — the agency may then decline the application on the basis of incomplete information; and</li>
          <li>(c) trigger a deletion request under <span className="act-pill">POPIA · S25</span> for the stored report data, subject to the applicable statutory retention windows set out in §07.</li>
        </ul>
      </section>

      {/* 07 */}
      <section id="retention">
        <p className="sec-num"><span className="bar" /><span>07 · Retention</span></p>
        <h2 className="sec-h">How long <span className="hl">we keep it</span></h2>
        <p>Credit check results and associated personal information are retained as follows:</p>
        <div className="ret">
          <div className="ret-row">
            <span className="what">
              Credit check results
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>declined or withdrawn applications</span>
            </span>
            <span className="basis">POPIA · s14</span>
            <span className="span">90 days</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Credit check results
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>part of an active lease record</span>
            </span>
            <span className="basis">Prescription Act · PPA s54 + Reg 33 + TAA s29</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Consent audit log
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>timestamp + consent text version</span>
            </span>
            <span className="basis">POPIA · s17</span>
            <span className="span">10 years</span>
          </div>
        </div>
        <p>
          After the applicable retention period, credit check data is deleted from production systems and excluded from backup retention thereafter.
          For the full retention schedule across all data categories, see our <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          If an inconsistency exists between this Credit Check Policy and the Pleks Terms of Service, the Terms of Service
          prevail unless mandatory law requires otherwise.
        </p>
        <p>
          <strong>NCA intermediary records:</strong>{" "}The licensed credit bureau intermediary is subject to
          bureau-industry retention obligations under the National Credit Regulations. This obligation rests with the service provider.
          Our 10-year consent audit log (above) satisfies any parallel accountability obligation on Pleks&rsquo;s side. The
          90-day deletion period for declined-application results applies to the credit report data held by Pleks — it does
          not affect the service provider&rsquo;s separate intermediary records.
        </p>
      </section>
    </LegalPageLayout>
  )
}
