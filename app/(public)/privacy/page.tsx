/**
 * app/(public)/privacy/page.tsx — POPIA privacy notice for Pleks
 *
 * Route:  /privacy
 * Auth:   public
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"

export const metadata: Metadata = {
  title: "Privacy Policy — Pleks",
  description: "How Pleks collects, uses, stores and shares personal information — written so a person can read it without a lawyer in the room.",
}

const SECTIONS = [
  { id: "who",       num: "01", label: "Who we are"        },
  { id: "collect",   num: "02", label: "What we collect"   },
  { id: "use",       num: "03", label: "How we use it"     },
  { id: "share",     num: "04", label: "Who we share with" },
  { id: "rights",    num: "05", label: "Your rights"       },
  { id: "retention", num: "06", label: "Retention"         },
  { id: "security",  num: "07", label: "Security"          },
  { id: "contact",   num: "08", label: "Contact"           },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["POPIA · S22 · NOTICE", "plain language", "v3.2"]}
      titleBefore="Privacy"
      titleHighlight="policy"
      subtitle="How Pleks collects, uses, stores and shares the personal information of agencies, landlords, tenants and rental applicants — written so a person can read it without a lawyer in the room."
      kicker={[
        { label: "Last reviewed", value: "2026 · 04 · 01", mono: true },
        { label: "In force from",  value: "2026 · 05 · 05", mono: true },
        { label: "Jurisdiction",   value: "Republic of South Africa" },
        { label: "Acts",           value: "POPIA · PAIA · RHA" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel="END · PRIVACY POLICY · v3.2"
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this policy means for you</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>We collect only what we need to run your agency on Pleks — contact details, lease data, and financial records you enter.</span></li>
          <li><span className="b" /><span>We will never sell your data, or that of your tenants, to third parties — ever.</span></li>
          <li><span className="b" /><span>Credit checks require your tenant&rsquo;s explicit written consent before we run them. We cannot override this.</span></li>
          <li><span className="b" /><span>You can request a full export of your organisation&rsquo;s data at any time, and delete it when you leave.</span></li>
          <li><span className="b" /><span>Data is processed in the United States (Supabase, Vercel) under Standard Contractual Clauses as required by <span className="act-pill">POPIA · S72</span>.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="who">
        <p className="sec-num"><span className="bar" /><span>01 · Identification</span></p>
        <h2 className="sec-h">Who <span className="hl">we are</span></h2>
        <p>
          Pleks is operated by <strong>Pleks (Pty) Ltd</strong>, a company registered in the Republic of South Africa.
          For the purposes of the Protection of Personal Information Act 4 of 2013 <span className="act-pill">POPIA</span>, Pleks acts as an <strong>Operator</strong> in respect of personal information processed on behalf of agencies using the platform.
        </p>
        <p>
          Agencies, landlords, and property managers using Pleks act as independent <strong>Responsible Parties</strong> in determining the purpose and means of processing tenant and applicant data.
        </p>
        <p>
          In limited circumstances where Pleks determines the purpose of processing — such as platform security, billing, and compliance — Pleks acts as a <strong>Responsible Party</strong>.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
        <p>
          Our registered office address is available on request and on the PAIA manual. If you act on behalf of a tenant or applicant,
          references to &ldquo;you&rdquo; in this policy include the data subject whose information you are submitting.
        </p>
      </section>

      {/* 02 */}
      <section id="collect">
        <p className="sec-num"><span className="bar" /><span>02 · Data we collect</span></p>
        <h2 className="sec-h">What <span className="hl">we collect</span></h2>
        <p>Depending on how you interact with Pleks — as an agency, landlord, tenant or applicant — we may collect the following categories of personal information:</p>
        <ul className="legal-list">
          <li><strong>Contact details.</strong> Full name, email address, phone number, physical address.</li>
          <li><strong>Identity.</strong> South African ID or passport number, used for verification under FICA.</li>
          <li><strong>Banking details.</strong> Account, branch and clearing details — for rent collection and owner payouts only.</li>
          <li><strong>Credit information.</strong> Collected only with your explicit written consent under <span className="act-pill">NCA · S69</span>, for the purpose of assessing rental applications.</li>
          <li><strong>Employment &amp; income.</strong> Pay slips, employer references and bank statements supplied during the application process.</li>
          <li><strong>Lease &amp; tenancy data.</strong> The leases, rent rolls, inspections and maintenance jobs you generate while using Pleks.</li>
        </ul>
      </section>

      {/* 03 */}
      <section id="use">
        <p className="sec-num"><span className="bar" /><span>03 · Lawful processing</span></p>
        <h2 className="sec-h">How <span className="hl">we use it</span></h2>
        <p>We process your personal information for the following purposes, and only for these purposes:</p>
        <ul className="legal-list">
          <li>Processing and evaluating rental applications submitted through your agency.</li>
          <li>Collecting rent and managing the audit trail of payment records.</li>
          <li>Reporting financial information to property owners on the schedule they have set.</li>
          <li>Communicating with you about your lease, payments, inspections or maintenance.</li>
          <li>Complying with our legal obligations under South African law.</li>
        </ul>
      </section>

      {/* 04 */}
      <section id="share">
        <p className="sec-num"><span className="bar" /><span>04 · Operators &amp; sub-processors</span></p>
        <h2 className="sec-h">Who <span className="hl">we share with</span></h2>
        <p>We share personal information only with trusted third parties who help us deliver Pleks. We do not sell personal information.</p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Party</th>
              <th>Purpose</th>
              <th style={{ width: "22%" }}>Region</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">Searchworx<span className="sub">credit bureau intermediary</span></td>
              <td>Credit and background checks on rental applicants under the NCA.</td>
              <td>South Africa</td>
            </tr>
            <tr>
              <td className="who">PayFast<span className="sub">payment processor</span></td>
              <td>Subscription billing and rent collection on the trust account.</td>
              <td>South Africa</td>
            </tr>
            <tr>
              <td className="who">DocuSeal<span className="sub">e-signature</span></td>
              <td>Generating, sending and storing signed lease and consent documents.</td>
              <td>SCC · POPIA s72</td>
            </tr>
            <tr>
              <td className="who">Supabase<span className="sub">database &amp; storage</span></td>
              <td>Encrypted storage of all personal information at rest and in transit.</td>
              <td>SCC · POPIA s72</td>
            </tr>
            <tr>
              <td className="who">Vercel<span className="sub">application hosting</span></td>
              <td>Serving the Pleks application and processing requests in transit.</td>
              <td>SCC · POPIA s72</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 05 */}
      <section id="rights">
        <p className="sec-num"><span className="bar" /><span>05 · Data subject rights</span></p>
        <h2 className="sec-h">Your <span className="hl">rights</span></h2>
        <p>Under <span className="act-pill">POPIA · S5</span> you have the right to:</p>
        <ul className="legal-list">
          <li>Request access to the personal information we hold about you, free of charge once per year.</li>
          <li>Request correction of inaccurate, irrelevant or incomplete information.</li>
          <li>Request deletion of your personal information, subject to legal retention requirements set out below.</li>
          <li>Object, on reasonable grounds, to processing of your personal information.</li>
          <li>Lodge a complaint with the Information Regulator at <a href="https://inforeg.org.za" target="_blank" rel="noopener noreferrer">inforeg.org.za</a>.</li>
        </ul>
        <p>To exercise any of these rights, contact our Information Officer using the details in section 08. We respond within a reasonable time, and no later than 30 days.</p>
      </section>

      {/* 06 */}
      <section id="retention">
        <p className="sec-num"><span className="bar" /><span>06 · Retention schedule</span></p>
        <h2 className="sec-h">How long <span className="hl">we keep it</span></h2>
        <p>We retain personal information only for as long as necessary to fulfil the purpose for which it was collected, or as required by law.</p>
        <div className="ret">
          <div className="ret-row">
            <span className="what">
              Rental applications
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>declined or withdrawn</span>
            </span>
            <span className="basis">POPIA · principle 8</span>
            <span className="span">12 months</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Lease records
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>after end of term</span>
            </span>
            <span className="basis">RHA · S5(7)</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Financial &amp; trust account records
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>SARS audit window</span>
            </span>
            <span className="basis">Tax Admin Act · S29</span>
            <span className="span">7 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Audit log
              <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>access &amp; consent events</span>
            </span>
            <span className="basis">internal · POPIA s19</span>
            <span className="span">10 years</span>
          </div>
        </div>
      </section>

      {/* 07 */}
      <section id="security">
        <p className="sec-num"><span className="bar" /><span>07 · Security &amp; transfer</span></p>
        <h2 className="sec-h">How <span className="hl">we protect it</span></h2>
        <p>
          Pleks encrypts personal information in transit (TLS 1.3) and at rest (AES-256). Sensitive fields — ID numbers,
          banking details, credit reports — are additionally encrypted at the column level. Access is logged, scoped to the smallest
          practical role, and reviewed quarterly.
        </p>
        <p>
          Some sub-processors operate outside South Africa. Where this applies, the transfer is governed by Standard Contractual
          Clauses approved under <span className="act-pill">POPIA · S72</span>, and the country&rsquo;s data-protection regime is verified
          before any data leaves.
        </p>
      </section>

      {/* 08 */}
      <section id="contact">
        <p className="sec-num"><span className="bar" /><span>08 · Contact &amp; complaints</span></p>
        <h2 className="sec-h">Contact <span className="hl">us</span></h2>
        <p>For any question about this policy, the data we hold, or to lodge a complaint, contact:</p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
        <div className="officer-card">
          <span className="l">Regulator</span>
          <span className="v">
            Information Regulator (South Africa)
            <span className="sub"><a href="https://inforeg.org.za" target="_blank" rel="noopener noreferrer">inforeg.org.za</a> · 010 023 5200</span>
          </span>
        </div>
        <p>
          If you are not satisfied with how Pleks has handled your personal information, you have the right to lodge a complaint
          directly with the Information Regulator. We will not retaliate against any data subject for exercising this right.
        </p>
      </section>
    </LegalPageLayout>
  )
}
