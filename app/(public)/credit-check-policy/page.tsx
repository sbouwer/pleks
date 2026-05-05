/**
 * app/(public)/credit-check-policy/page.tsx — credit check policy for rental applicants
 *
 * Route:  /credit-check-policy
 * Auth:   public
 * Notes:  Referenced from the applicant consent screen during application flow.
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"

export const metadata: Metadata = {
  title: "Credit Check Policy — Pleks",
  description: "How Pleks uses Searchworx to run credit and background checks on rental applicants, and your rights as a data subject.",
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
      eyebrowParts={["NCA · S69 · CONSENT", "applicants", "v1.1"]}
      titleBefore="Credit check"
      titleHighlight="policy"
      subtitle="How Searchworx credit and background checks work, what your R399 fee covers, and the rights you hold as a data subject under POPIA and the National Credit Act."
      kicker={[
        { label: "Last reviewed", value: "2026 · 04 · 01", mono: true },
        { label: "In force from",  value: "2026 · 05 · 05", mono: true },
        { label: "Conducted by",   value: "Searchworx (Pty) Ltd" },
        { label: "Acts",           value: "NCA · POPIA · FICA" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel="END · CREDIT CHECK POLICY · v1.1"
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this means for you as an applicant</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>No credit check will ever be run without your explicit written consent — this is a legal requirement under the NCA.</span></li>
          <li><span className="b" /><span>The R399 fee is paid by you (the applicant) — the agency using Pleks does not pay for your check.</span></li>
          <li><span className="b" /><span>Checks are run by Searchworx, a registered bureau intermediary. Pleks never accesses bureau data directly.</span></li>
          <li><span className="b" /><span>You have the right to receive a free copy of the credit report generated for your application.</span></li>
          <li><span className="b" /><span>Check results are retained for 12 months, then permanently deleted unless tied to an active lease.</span></li>
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
              <td className="who">XDS<span className="sub">credit bureau</span></td>
              <td>Credit bureau records, default listings, adverse payment behaviour.</td>
            </tr>
            <tr>
              <td className="who">TPN Credit Bureau<span className="sub">rental bureau</span></td>
              <td>Tenant payment performance data specific to the rental market.</td>
            </tr>
            <tr>
              <td className="who">Home Affairs (DHA)<span className="sub">identity verification</span></td>
              <td>Verification of South African ID number and biometric identity.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The results of these checks form part of your <strong>FitScore</strong> — a weighted applicant rating that the agency uses
          to evaluate your suitability for the property. FitScore combines bureau data with income affordability and employment
          verification. No single factor is automatically disqualifying.
        </p>
      </section>

      {/* 02 */}
      <section id="who">
        <p className="sec-num"><span className="bar" /><span>02 · Service provider</span></p>
        <h2 className="sec-h">Who runs <span className="hl">the checks</span></h2>
        <p>
          All credit and background checks are conducted by <strong>Searchworx (Pty) Ltd</strong>, a registered credit bureau
          intermediary operating under the National Credit Act 34 of 2005 <span className="act-pill">NCA · S69</span>. Pleks does
          not access credit bureau data directly — all bureau queries, data handling and reporting are performed by Searchworx.
        </p>
        <div className="officer-card">
          <span className="l">Service<br />provider</span>
          <span className="v">
            Searchworx (Pty) Ltd
            <span className="sub">Registered credit bureau intermediary · NCA</span>
          </span>
        </div>
        <p>
          Searchworx is bound by its own regulatory obligations regarding the handling of your personal information, including
          obligations under the <span className="act-pill">NCA</span>, the <span className="act-pill">POPIA</span>, and the
          Financial Intelligence Centre Act <span className="act-pill">FICA</span>.
        </p>
      </section>

      {/* 03 */}
      <section id="fee">
        <p className="sec-num"><span className="bar" /><span>03 · Application fee</span></p>
        <h2 className="sec-h">The <span className="hl">R399 fee</span></h2>
        <p>
          A once-off fee of <strong>R399</strong> is charged per credit check bundle. This fee covers all bureau queries listed in
          section 01 and is paid by the applicant at the time of progressing to Stage 2 of the application.
        </p>
        <ul className="legal-list">
          <li>The fee is non-refundable once the credit check has been initiated, as bureau queries are processed immediately.</li>
          <li>The fee is paid directly by the applicant — the agency using Pleks does not pay for your check.</li>
          <li>Joint applications (two applicants on one lease) are charged R749 for the combined bundle.</li>
          <li>If your application is withdrawn before Stage 2, no fee is charged — credit checks are only triggered when you choose to proceed.</li>
        </ul>
      </section>

      {/* 04 */}
      <section id="popia">
        <p className="sec-num"><span className="bar" /><span>04 · Legal basis</span></p>
        <h2 className="sec-h">Legal basis <span className="hl">under POPIA</span></h2>
        <p>
          Credit checks are processed on the basis of your <strong>explicit consent</strong>, as required by section 11(1)(a) of the
          Protection of Personal Information Act <span className="act-pill">POPIA · S11</span>. Before any check is initiated,
          you will be asked to read this policy and provide your informed consent via a signed digital consent form.
        </p>
        <p>
          The NCA independently requires that credit bureaus may only be queried with the data subject&rsquo;s written consent under{" "}
          <span className="act-pill">NCA · S69</span>. Both frameworks apply. No credit check will be performed without this dual
          consent being obtained first.
        </p>
        <p>
          Pleks retains a timestamped record of your consent in our audit log, as required by <span className="act-pill">POPIA · S19</span>.
          You may request a copy of this record by contacting our Information Officer.
        </p>
      </section>

      {/* 05 */}
      <section id="rights">
        <p className="sec-num"><span className="bar" /><span>05 · Your rights</span></p>
        <h2 className="sec-h">Your <span className="hl">rights</span></h2>
        <p>As the subject of a credit check, you have the following rights under South African law:</p>
        <ul className="legal-list">
          <li>You may request a <strong>free copy</strong> of the credit report generated as part of your application — contact us at <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>.</li>
          <li>If you believe information in the report is inaccurate, you may lodge a dispute directly with the relevant bureau (TransUnion, XDS, or TPN). Bureaus are required to investigate and respond within 20 business days under the <span className="act-pill">NCA · S72</span>.</li>
          <li>You may contact our Information Officer for assistance with the dispute process, or to escalate a complaint.</li>
          <li>You may lodge a complaint about data handling with the <a href="https://inforeg.org.za" target="_blank" rel="noopener noreferrer">Information Regulator</a> at any time.</li>
        </ul>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
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
          You may, however, <strong>withdraw consent for any future checks or processing of your information</strong> by contacting
          us at <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>. Withdrawal of consent for future processing will not
          affect the lawfulness of processing that occurred before withdrawal.
        </p>
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
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>declined or withdrawn applications</span>
            </span>
            <span className="basis">POPIA · principle 8</span>
            <span className="span">12 months</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Credit check results
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>part of an active lease record</span>
            </span>
            <span className="basis">RHA · S5(7)</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Consent audit log
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>timestamp + consent text version</span>
            </span>
            <span className="basis">POPIA · S19</span>
            <span className="span">10 years</span>
          </div>
        </div>
        <p>
          After the applicable retention period, credit check data is permanently and irreversibly deleted from our systems.
          For the full retention schedule across all data categories, see our <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>
    </LegalPageLayout>
  )
}
