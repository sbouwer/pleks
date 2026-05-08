/**
 * app/(public)/paia-manual/page.tsx — PAIA s51 manual for Pleks (Pty) Ltd
 *
 * Route:  /paia-manual
 * Auth:   public
 * Notes:  Required under PAIA s51 for every private body. Describes record categories
 *         held by Pleks and the procedure for requesting access.
 */
import type { Metadata } from "next"
import Link from "next/link"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { PrintButton } from "@/components/legal/PrintButton"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"

export const metadata: Metadata = {
  title: "PAIA Manual — Pleks",
  description: "Pleks (Pty) Ltd's PAIA s51 manual — record categories held by Pleks, the procedure for requesting access, and Information Officer contact details.",
}

const SECTIONS = [
  { id: "intro",         num: "01", label: "Introduction"           },
  { id: "contact",       num: "02", label: "Contact details"        },
  { id: "guide",         num: "03", label: "SAHRC guide"            },
  { id: "available",     num: "04", label: "Available records"      },
  { id: "held",          num: "05", label: "Records held"           },
  { id: "refused",       num: "06", label: "Grounds for refusal"    },
  { id: "request",       num: "07", label: "How to request access"  },
  { id: "processors",    num: "08", label: "Sub-processors"         },
  { id: "security",      num: "09", label: "Security & protection"  },
  { id: "amendments",    num: "10", label: "Amendments"             },
  { id: "certification", num: "11", label: "Certification"          },
]

export default function PAIAManualPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["PAIA · S51", "private body", LEGAL_VERSIONS.paiaManual]}
      titleBefore="PAIA"
      titleHighlight="manual"
      subtitle="Pleks (Pty) Ltd's manual compiled in accordance with section 51 of the Promotion of Access to Information Act 2 of 2000 — record categories, access request procedure, and contact details."
      kicker={[
        { label: "Last reviewed",  value: "2026 · 05 · 05",  mono: true },
        { label: "Effective date", value: "2025 · 06 · 01",  mono: true },
        { label: "Compiled by",    value: "Pleks (Pty) Ltd"             },
        { label: "Act",            value: "PAIA · s51"                  },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel={`END · PAIA MANUAL · ${LEGAL_VERSIONS.paiaManual}`}
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What this manual covers</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>This manual is required by PAIA s51. It describes the categories of records held by Pleks and explains how to request access to them.</span></li>
          <li><span className="b" /><span>Many records — including our Privacy Policy, Terms of Service, Cookie Policy, Credit Check Policy, and this manual — are freely available on our website without any request.</span></li>
          <li><span className="b" /><span>Formal PAIA access requests must use Form 2 (available from the Information Regulator). The regulated request fee is R140. We respond within 30 days.</span></li>
          <li><span className="b" /><span>Data subjects have additional rights under POPIA — most can be exercised directly in Settings &rarr; Data &amp; Privacy within the platform, or by contacting our Information Officer.</span></li>
          <li><span className="b" /><span>Rejected applicant data is automatically purged 90 days after rejection — this manual is a public commitment to that window.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="intro">
        <p className="sec-num"><span className="bar" /><span>01 · Introduction</span></p>
        <h2 className="sec-h"><span className="hl">Introduction</span></h2>
        <p>
          Section 51 of the Promotion of Access to Information Act 2 of 2000 <span className="act-pill">PAIA</span> requires every
          private body to compile a manual containing the information prescribed in that section. This manual has been compiled in
          accordance with those requirements.
        </p>
        <p>
          Pleks (Pty) Ltd is a private body as defined in PAIA. This manual describes the categories of records held by Pleks,
          explains the procedure for requesting access to those records, and provides the contact details of our Information Officer.
        </p>
        <p>
          This manual is made available in accordance with section 51 of PAIA and the applicable PAIA Regulations.
          The current version is always available at{" "}
          <a href="/paia-manual">pleks.co.za/paia-manual</a>.
        </p>
        <div className="officer-card" style={{ alignItems: "center" }}>
          <span className="l">Download<br />this manual</span>
          <span className="v" style={{ display: "flex", alignItems: "center" }}>
            <PrintButton label="PAIA manual" />
          </span>
        </div>
      </section>

      {/* 02 */}
      <section id="contact">
        <p className="sec-num"><span className="bar" /><span>02 · Contact details</span></p>
        <h2 className="sec-h">Contact <span className="hl">details</span></h2>
        <p>
          <strong>2.1 Information Officer</strong>
        </p>
        <p>
          Every private body is required by <span className="act-pill">POPIA · S55</span> to designate an Information Officer.
          Pleks has registered its Information Officer with the Information Regulator of South Africa. For the purposes of
          PAIA s51(1)(a), the head of Pleks (Pty) Ltd is Stéan Bouwer, who also serves as Information Officer.
        </p>
        <div className="officer-card">
          <span className="l">Head &amp; Information<br />officer</span>
          <span className="v">
            Stéan Bouwer · Pleks (Pty) Ltd
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a> · Western Cape, South Africa</span>
          </span>
        </div>
        <p>
          <strong>2.2 Information Regulator</strong>
        </p>
        <p>
          Any person whose request for access to records has been refused, or who wishes to lodge a complaint regarding Pleks&rsquo;s
          processing of personal information, may approach the Information Regulator:
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
      </section>

      {/* 03 */}
      <section id="guide">
        <p className="sec-num"><span className="bar" /><span>03 · SAHRC guide</span></p>
        <h2 className="sec-h">Guide on how to <span className="hl">use PAIA</span></h2>
        <p>
          The South African Human Rights Commission (SAHRC) has compiled a guide explaining how to use PAIA. This guide is
          available in all official languages and can be obtained from:
        </p>
        <ul className="legal-list">
          <li>The SAHRC website at <ExtLink href={EXTERNAL_LINKS.sahrc}>sahrc.org.za</ExtLink></li>
          <li>Telephonically from the SAHRC</li>
          <li>The SAHRC office: 29 Princess of Wales Terrace, Parktown, Johannesburg</li>
        </ul>
        <p>
          Pleks will also assist any requester who contacts our Information Officer with guidance on how to submit a PAIA request.
        </p>
      </section>

      {/* 04 */}
      <section id="available">
        <p className="sec-num"><span className="bar" /><span>04 · Records available without a request</span></p>
        <h2 className="sec-h">Available <span className="hl">without a request</span></h2>
        <p>
          The following categories of records are automatically available to any person without the need to submit a formal PAIA
          request. These are publicly accessible via pleks.co.za.
        </p>
        <p><strong>4.1 Public legal documents</strong></p>
        <ul className="legal-list">
          <li><a href="/privacy">Privacy Policy</a></li>
          <li><a href="/terms">Terms of Service</a></li>
          <li><a href="/popia-register">POPIA Processing Register</a></li>
          <li><a href="/credit-check-policy">Credit Check Policy</a></li>
          <li><a href="/cookie-policy">Cookie Policy</a></li>
          <li><a href="/paia-manual">This PAIA Manual</a></li>
        </ul>
        <p><strong>4.2 General product information</strong></p>
        <ul className="legal-list">
          <li>Product feature descriptions and pricing (<Link href="/#pricing" className="act-pill">pleks.co.za/#pricing</Link>)</li>
          <li>Sub-processor list (published within the Privacy Policy and section 08 of this manual)</li>
        </ul>
        <p>No request or fee is required to access any of the documents listed above.</p>
      </section>

      {/* 05 */}
      <section id="held">
        <p className="sec-num"><span className="bar" /><span>05 · Records held by Pleks</span></p>
        <h2 className="sec-h">Records <span className="hl">held</span></h2>
        <p>
          Pleks holds records in the following categories. The categories reflect the nature of Pleks as a property management
          software platform serving estate agents, property managers, landlords, tenants, and rental applicants.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Category / subjects</th>
              <th>Examples</th>
              <th style={{ width: "20%" }}>Retention</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">
                Employment &amp; contractor records
                <span className="sub">Employees, contractors, consultants</span>
              </td>
              <td>Employment contracts, payroll records, performance records, contractor agreements, tax records</td>
              <td>5 years after end of employment or contract</td>
            </tr>
            <tr>
              <td className="who">
                Customer &amp; subscription records
                <span className="sub">Agency clients (estate agencies, property managers)</span>
              </td>
              <td>Organisation registration details, subscription agreements, billing records, payment processor transaction logs (see §08 sub-processors directory), tier and usage data, audit logs (see Compliance records row — 7-year retention governs), communication preferences</td>
              <td>5 years after subscription end</td>
            </tr>
            <tr>
              <td className="who">
                Platform user records
                <span className="sub">Agents, property managers, accountants, and other staff registered on Pleks</span>
              </td>
              <td>Name, email address, phone number, PPRA registration number, role assignments, authentication records, audit trail of actions taken on the platform</td>
              <td>5 years after user account deactivation</td>
            </tr>
            <tr>
              <td className="who">
                Landlord records
                <span className="sub">Property owners managed by agencies using Pleks</span>
              </td>
              <td>Contact details, banking details for rental income disbursement, property ownership information, financial statements, owner portal access records</td>
              <td>5 years after the last active lease associated with the landlord</td>
            </tr>
            <tr>
              <td className="who">
                Tenancy records
                <span className="sub">Current and former tenants</span>
              </td>
              <td>Contact details, identity document number, lease agreements, payment records, arrears history, maintenance requests, inspection records, deposit records, communications log, portal access records</td>
              <td>5 years after lease end (PPA Regulation 33 and RHA evidentiary practice)</td>
            </tr>
            <tr>
              <td className="who">
                Application &amp; screening records
                <span className="sub">Rental applicants</span>
              </td>
              <td>
                Contact details, employment information, income documentation, identity documents, bank statements, credit bureau reports (where explicit consent was obtained), FitScore assessment, application status.
                <br /><br />
                <strong>Successful applicants:</strong> retained as tenant records.{" "}
                <strong>Unsuccessful applicants:</strong> 90 days after rejection, then purged automatically — including identity documents, bank statements, and income records in storage, not only database rows. This manual constitutes a public commitment to that window.
              </td>
              <td>Successful: 5 years.<br />Unsuccessful: 90 days.</td>
            </tr>
            <tr>
              <td className="who">
                Property records
                <span className="sub">Residential and commercial properties managed via Pleks</span>
              </td>
              <td>Property address, erf and unit details, municipal account information, HOA records, property photos</td>
              <td>Retained while active; 5 years after removal</td>
            </tr>
            <tr>
              <td className="who">
                Inspection &amp; condition records
                <span className="sub">Properties under active or previous management</span>
              </td>
              <td>Ingoing and outgoing inspection reports, room-by-room condition ratings, inspection photographs (compressed, JPEG), GPS coordinates and timestamps extracted from original photographs, voice notes, wear and tear assessments, AI-generated condition summaries</td>
              <td>3 years post-termination; extended to 5 years if a Tribunal dispute arises within the retention window</td>
            </tr>
            <tr>
              <td className="who">
                Financial &amp; trust account records
                <span className="sub">Tenant payments, landlord disbursements, trust transactions</span>
              </td>
              <td>
                Bank statement imports, payment allocations, interest calculations (deposit interest, arrears interest), trust account reconciliation records, invoice and receipt records, financial reports.{" "}
                Pleks provides tools for trust account visibility and reconciliation — it is not a bank or a registered credit provider.
              </td>
              <td>5 years after the relevant financial period (PPA Regulation 33 trust audit requirement)</td>
            </tr>
            <tr>
              <td className="who">
                Maintenance records
                <span className="sub">Properties, tenants, and maintenance contractors</span>
              </td>
              <td>Maintenance requests, job assignments, contractor details, progress updates, completion records, invoices, photographs, voice notes, delay records</td>
              <td>3 years after job completion (Tribunal evidentiary practice)</td>
            </tr>
            <tr>
              <td className="who">
                Compliance records
                <span className="sub">All data subjects interacting with Pleks</span>
              </td>
              <td>Consent log (timestamp, IP address, consent version, purpose), audit log of all state changes on the platform, authentication events, credit check consent records, data subject request records</td>
              <td>7 years (POPIA s17 — Documentation / accountability)</td>
            </tr>
            <tr>
              <td className="who">
                Communications records
                <span className="sub">Tenants, landlords, agents, applicants</span>
              </td>
              <td>Transactional emails (rent receipts, arrears notices, inspection reminders), SMS and WhatsApp messages sent via Africa&rsquo;s Talking, in-app notifications, delivery status records</td>
              <td>5 years post-termination (full body retained for Tribunal evidence — no distinction between mandatory and operational)</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 06 */}
      <section id="refused">
        <p className="sec-num"><span className="bar" /><span>06 · Records that may be refused</span></p>
        <h2 className="sec-h">Grounds for <span className="hl">refusal</span></h2>
        <p>
          Pleks may refuse access to records in the following circumstances, as provided for in PAIA:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Third-party personal information.</strong> Records containing personal information about a third party will not
            be disclosed without the consent of that third party, unless disclosure is required by law or is in the public interest.
            For example, a tenant may not access another tenant&rsquo;s personal information.
          </li>
          <li>
            <strong>Commercially sensitive information.</strong> Records containing confidential commercial information, trade
            secrets, or proprietary business information — including the Pleks platform source code, internal pricing models, and
            client-specific configurations — may be refused on the grounds of commercial confidentiality.
          </li>
          <li>
            <strong>Legal professional privilege.</strong> Communications between Pleks and its legal advisors that attract legal
            professional privilege will not be disclosed.
          </li>
          <li>
            <strong>Internal deliberative records.</strong> Internal records relating to deliberative processes, including draft
            documents, internal strategic discussions, and product development records not yet published, may be refused.
          </li>
          <li>
            <strong>Records harmful to law enforcement.</strong> Records whose disclosure would prejudice a pending investigation,
            legal proceeding, or law enforcement operation may be refused.
          </li>
        </ul>
        <p>
          Even where grounds for refusal exist, Pleks will consider whether the public interest in disclosure outweighs the grounds
          for refusal, as provided by <span className="act-pill">PAIA · S70</span> (the public-interest override for private bodies).
          Note: PAIA s46 applies to public bodies only; for private bodies the equivalent provision is s70.
        </p>
      </section>

      {/* 07 */}
      <section id="request">
        <p className="sec-num"><span className="bar" /><span>07 · How to request access</span></p>
        <h2 className="sec-h">How to <span className="hl">request access</span></h2>
        <p><strong>7.1 Who may request</strong></p>
        <p>
          Any person — including a juristic person — may request access to records held by Pleks. Data subjects (individuals whose
          personal information is processed by Pleks) have specific rights under POPIA in addition to their PAIA rights.
        </p>
        <p><strong>7.2 How to submit a request</strong></p>
        <p>
          PAIA requests must be submitted using Form 2, prescribed under the 2021 PAIA Regulations. This form is available from:
        </p>
        <ul className="legal-list">
          <li>The Information Regulator website at <ExtLink href={EXTERNAL_LINKS.informationRegulator}>inforegulator.org.za</ExtLink></li>
          <li>Our Information Officer at <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a> — who will provide the form on request</li>
          <li>The Data &amp; Privacy section within the Pleks platform (for registered users)</li>
        </ul>
        <p>
          Informal email requests that do not use Form 2 will be acknowledged but cannot be processed as formal PAIA requests.
          Our Information Officer will assist any requester in completing the correct form.
        </p>
        <p>The request must include:</p>
        <ul className="legal-list">
          <li>The requester&rsquo;s full name and contact details</li>
          <li>A description of the records being requested, with sufficient detail to identify them</li>
          <li>The form in which the records are requested (electronic or paper)</li>
          <li>If the request is made on behalf of another person, proof of authority to do so</li>
        </ul>
        <p><strong>7.3 Request fees</strong></p>
        <p>
          PAIA provides for a request fee and an access fee. The current prescribed fees are set by regulation and are subject to
          change. As at the date of this manual:
        </p>
        <ul className="legal-list">
          <li><strong>Request fee:</strong> R140.00 (the regulated maximum under the 2021 PAIA Regulations for private bodies; payable before the request is processed, unless waived)</li>
          <li><strong>Access fee:</strong> Calculated based on the form and volume of records, per the PAIA regulations</li>
        </ul>
        <p>
          No request fee is charged where a data subject requests access to their own personal information, in accordance with
          regulation 7 of the 2021 PAIA Regulations. Self-service data access via Settings &rarr; Data &amp; Privacy within the
          platform is always free.
        </p>
        <p><strong>7.4 Response timeframe</strong></p>
        <p>
          Pleks will respond to a PAIA request within 30 days of receipt of the request, as required by{" "}
          <span className="act-pill">PAIA · S56</span>. If the request is for a large volume of records or is otherwise complex,
          Pleks may extend this period by a further 30 days with written notice to the requester.
        </p>
        <p><strong>7.5 If a request is refused</strong></p>
        <p>
          If Pleks refuses a request, the Information Officer will provide written reasons for the refusal. The requester may then:
        </p>
        <ul className="legal-list">
          <li>Apply to the Information Regulator for a review of the decision</li>
          <li>Apply to a court for relief</li>
        </ul>
        <p><strong>7.6 Data subject rights under POPIA</strong></p>
        <p>
          Data subjects have the following rights under POPIA which may be exercised directly, without a formal PAIA request:
        </p>
        <ul className="legal-list">
          <li><strong>Access (s23)</strong> — request a copy of personal information held, including the right to receive it in a usable form. The platform&rsquo;s bulk-export feature provides a structured archive as a voluntary product commitment.</li>
          <li><strong>Correction (s24)</strong> — request correction or deletion of inaccurate, misleading, outdated, incomplete, or unlawfully obtained personal information</li>
          <li><strong>Deletion / restriction (s25)</strong> — request destruction or deletion of personal information no longer authorised to be retained, subject to statutory retention obligations</li>
          <li><strong>Objection (s11(3))</strong> — object to processing based on legitimate interests on grounds relating to your particular situation</li>
          <li><strong>Automated-decision reconsideration (s71)</strong> — Pleks does not make automated decisions about applicants; if you believe an automated decision was nonetheless made, you may request reconsideration and the underlying logic of the decision</li>
          <li><strong>Withdraw consent</strong> — withdraw consent where it is the lawful basis; withdrawal does not affect lawfulness of prior processing</li>
        </ul>
        <p>
          Registered Pleks users may exercise most of these rights directly in Settings &rarr; Data &amp; Privacy within the
          platform. All other requests must be submitted to our Information Officer. We will respond within 30 days.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer · Pleks (Pty) Ltd
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>

      {/* 08 */}
      <section id="processors">
        <p className="sec-num"><span className="bar" /><span>08 · Sub-processors &amp; cross-border transfers</span></p>
        <h2 className="sec-h">Sub-processors &amp; <span className="hl">transfers</span></h2>
        <p>
          Pleks processes personal information using the following third-party sub-processors. All cross-border transfers are
          governed by Standard Contractual Clauses or equivalent mechanisms as required by{" "}
          <span className="act-pill">POPIA · S72</span>.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "25%" }}>Sub-processor</th>
              <th>Purpose &amp; location</th>
              <th style={{ width: "28%" }}>Transfer mechanism</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">Supabase<span className="sub">database &amp; auth</span></td>
              <td>Database storage and authentication — United States</td>
              <td>Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Vercel<span className="sub">application hosting</span></td>
              <td>Application hosting and global edge delivery — United States and global edge</td>
              <td>Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Resend<span className="sub">transactional email</span></td>
              <td>Transactional email delivery — United States</td>
              <td>Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Africa&rsquo;s Talking<span className="sub">SMS &amp; WhatsApp aggregator</span></td>
              <td>SMS and WhatsApp message delivery — Kenya (Nairobi)</td>
              <td>Kenya Data Protection Act 2019 + Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Meta<span className="sub">WhatsApp Business Platform</span></td>
              <td>Upstream WhatsApp Business Platform — United States (California) / Ireland (EU), reached via Africa&rsquo;s Talking. Transactional templates only.</td>
              <td>Standard Contractual Clauses (via Africa&rsquo;s Talking relationship)</td>
            </tr>
            <tr>
              <td className="who">Anthropic<span className="sub">AI processing</span></td>
              <td>AI-assisted lease drafting, application assessment, and document generation — United States. Enterprise DPA, zero data retention after processing.</td>
              <td>Enterprise DPA + Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Searchworx<span className="sub">credit &amp; identity</span></td>
              <td>Credit bureau aggregator across TransUnion, Experian, Compuscan, XDS, TPN, plus identity verification via Home Affairs (DHA) — South Africa. Consent-gated: checks only run when explicit written consent has been recorded.</td>
              <td>South Africa (domestic)</td>
            </tr>
            <tr>
              <td className="who">DocuSeal<span className="sub">e-signature</span></td>
              <td>Digital document signing — self-hosted on Hetzner SA (South African infrastructure). No data leaves Pleks&rsquo;s infrastructure.</td>
              <td>South Africa — Hetzner SA (domestic; no SCCs required)</td>
            </tr>
            <tr>
              <td className="who">Sentry<span className="sub">error monitoring</span></td>
              <td>Application error tracking and performance monitoring — United States. PII scrubbing configured; error events contain stack traces and route paths, with query parameters stripped.</td>
              <td>Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">Better Stack<span className="sub">uptime monitoring</span></td>
              <td>Uptime monitoring — United States. Operational metadata only; no personal data transmitted.</td>
              <td>Standard Contractual Clauses</td>
            </tr>
            <tr>
              <td className="who">PayFast<span className="sub">payment processing</span></td>
              <td>Payment processing for subscriptions — South Africa. PCI-DSS compliant.</td>
              <td>South Africa (domestic)</td>
            </tr>
          </tbody>
        </table>
        <p>
          The sub-processor list above is reviewed at least annually. The current list is also published within our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      {/* 09 */}
      <section id="security">
        <p className="sec-num"><span className="bar" /><span>09 · Security &amp; data protection</span></p>
        <h2 className="sec-h">Security &amp; <span className="hl">data protection</span></h2>
        <p>
          Pleks implements technical and organisational measures appropriate to the risks of the personal information we process,
          as required by <span className="act-pill">POPIA · S19</span>. Key measures include:
        </p>
        <ul className="legal-list">
          <li>Passkey-native authentication for all agency staff, with step-up verification required for trust account actions</li>
          <li>Row-level security enforcing strict organisational data isolation — no cross-organisation data leakage is possible at the database level</li>
          <li>AES-256 encryption at rest for all stored personal information; application-level encryption before INSERT for sensitive fields (ID numbers, banking details, credit reports), so raw values are never visible in database dumps or to infrastructure operators</li>
          <li>TLS 1.3 encryption in transit for all communications</li>
          <li>Immutable audit log of all state changes, retained for 7 years</li>
          <li>Client-side compression of inspection photographs, with GPS coordinates and timestamps extracted and stored separately as tamper-evident metadata</li>
          <li>Automatic purge of rejected applicant data after 90 days</li>
          <li>Consent log recording timestamp, IP address, consent version, and purpose for every POPIA consent event</li>
        </ul>
        <p><strong>9.1 Data breach notification</strong></p>
        <p>
          In the event of a data breach, Pleks will:
        </p>
        <ul className="legal-list">
          <li>Notify the Information Regulator as soon as reasonably possible (<span className="act-pill">POPIA · S22</span> — this is the statutory standard; POPIA s22 does not specify a 72-hour window) and in any event within 72 hours as a self-imposed standard for Pleks&rsquo;s Part A processing. This obligation applies to Pleks as Responsible Party for Part A data. For Part B (agency-managed) data, the Pleks-to-agency notification commitment (within 72 hours, per ToS §09.4) is an Operator-to-RP obligation under POPIA s21; the agency then independently assesses its s22 obligation to notify the Regulator and affected data subjects.</li>
          <li>Notify affected data subjects of Part A breaches as soon as reasonably practicable</li>
          <li>Maintain a written record of the breach and the steps taken in response</li>
        </ul>
        <p><strong>9.2 Retention schedule</strong></p>
        <div className="ret">
          <div className="ret-row">
            <span className="what">
              Lease &amp; financial records
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>after lease end</span>
            </span>
            <span className="basis">Prescription Act · PPA s54 + Reg 33 · TAA s29</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Inspection records &amp; photos
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>Tribunal evidence preservation</span>
            </span>
            <span className="basis">RHA evidentiary practice</span>
            <span className="span">3 years (5 if Tribunal dispute)</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Authentication &amp; audit logs
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>POPIA accountability &amp; breach investigation</span>
            </span>
            <span className="basis">POPIA · s17</span>
            <span className="span">7 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Credit check records
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>declined / withdrawn applications</span>
            </span>
            <span className="basis">POPIA · s14 · Credit Bureau Code</span>
            <span className="span">90 days</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Credit check records
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>active lease records</span>
            </span>
            <span className="basis">Prescription Act · PPA s54</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Legal notice communications
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>arrears, Section 4, deposit deductions</span>
            </span>
            <span className="basis">RHA · s4B</span>
            <span className="span">5 years</span>
          </div>
          <div className="ret-row">
            <span className="what">
              All tenant communications
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>mandatory + operational</span>
            </span>
            <span className="basis">POPIA · s14 · TAA s29</span>
            <span className="span">5 years post-termination</span>
          </div>
          <div className="ret-row">
            <span className="what">
              Rejected applicant data
              <br /><span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>automatic purge — all associated records</span>
            </span>
            <span className="basis">POPIA · s14</span>
            <span className="span">90 days</span>
          </div>
        </div>
      </section>

      {/* 10 */}
      <section id="amendments">
        <p className="sec-num"><span className="bar" /><span>10 · Amendments</span></p>
        <h2 className="sec-h"><span className="hl">Amendments</span></h2>
        <p>
          Pleks will review this manual at least once every two years, or whenever there is a material change in our records,
          processing activities, or the applicable law. The current version of this manual is always available at{" "}
          <Link href="/paia-manual" className="act-pill">pleks.co.za/paia-manual</Link>.
        </p>
        <p>
          If an inconsistency exists between this PAIA Manual and the Pleks Terms of Service, the Terms of Service
          prevail unless mandatory law requires otherwise.
        </p>
        <p>
          The version number and effective date on the cover of this document indicate when it was last updated. Requesters are
          encouraged to check the website for the most current version before submitting a request.
        </p>
      </section>

      {/* 11 */}
      <section id="certification">
        <p className="sec-num"><span className="bar" /><span>11 · Certification</span></p>
        <h2 className="sec-h"><span className="hl">Certification</span></h2>
        <p>
          This PAIA manual has been compiled in accordance with the requirements of section 51 of the Promotion of Access to
          Information Act 2 of 2000 and approved this 5th day of May 2026 by the Information Officer of Pleks (Pty) Ltd.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <br /><span className="sub">Information Officer · Pleks (Pty) Ltd · 5 May 2026</span>
          </span>
        </div>
      </section>
    </LegalPageLayout>
  )
}
