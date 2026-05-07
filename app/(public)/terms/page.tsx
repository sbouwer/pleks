/**
 * app/(public)/terms/page.tsx — Terms of service for Pleks
 *
 * Route:  /terms
 * Auth:   public
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"

export const metadata: Metadata = {
  title: "Terms of Service — Pleks",
  description: "The agreement that governs your use of the Pleks property management platform.",
}

const SECTIONS = [
  { id: "acceptance",     num: "01", label: "Acceptance"             },
  { id: "description",    num: "02", label: "Description of service" },
  { id: "subscription",   num: "03", label: "Subscription & payment" },
  { id: "cancellation",   num: "04", label: "Cancellation"           },
  { id: "prohibited",     num: "05", label: "Prohibited uses"        },
  { id: "liability",      num: "06", label: "Limitation of liability"},
  { id: "governing",      num: "07", label: "Governing law"          },
  { id: "availability",   num: "08", label: "Service availability"   },
  { id: "dataprocessing", num: "09", label: "Data processing"        },
  { id: "general",        num: "10", label: "General provisions"     },
]

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      eyebrowParts={["SaaS · TERMS", "binding agreement", LEGAL_VERSIONS.terms]}
      titleBefore="Terms of"
      titleHighlight="service"
      subtitle="The agreement that governs your use of the Pleks property management platform. By using Pleks you confirm that you have read and accepted these terms."
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 07", mono: true },
        { label: "Effective",     value: "2026 · 05 · 07", mono: true },
        { label: "Jurisdiction",  value: "Republic of South Africa" },
        { label: "Framework",     value: "CPA · ECT Act · PPA · POPIA" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel={`END · TERMS OF SERVICE · ${LEGAL_VERSIONS.terms}`}
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What you&rsquo;re agreeing to</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>By using Pleks you accept these terms — they form a legally binding agreement with Pleks (Pty) Ltd concluded by data message under the ECT Act.</span></li>
          <li><span className="b" /><span>Subscription fees are billed monthly or annually via our payment processor, in ZAR inclusive of VAT where applicable.</span></li>
          <li><span className="b" /><span>Cancel at any time from your account settings; access continues until your billing period ends. Natural-person CPA subscribers may cancel on 20 business days&rsquo; notice at any time on a fixed-term plan.</span></li>
          <li><span className="b" /><span>After cancellation you have 12 months of read-only access before operational data is deleted. Statutory obligations require some categories to be retained for longer — see §04 and the POPIA register.</span></li>
          <li><span className="b" /><span>§09 sets out the full data-processing terms governing Pleks&rsquo;s obligations as Operator under POPIA s20–s21, including the 72-hour breach-notification commitment.</span></li>
          <li><span className="b" /><span>Pleks does not hold client funds. Trust money is held in the agency&rsquo;s own Section 86 account.</span></li>
          <li><span className="b" /><span>Governing law: Republic of South Africa. CPA subscribers may also approach the National Consumer Tribunal or Magistrate&rsquo;s Court.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="acceptance">
        <p className="sec-num"><span className="bar" /><span>01 · Acceptance</span></p>
        <h2 className="sec-h">Accepting <span className="hl">these terms</span></h2>
        <p>
          By accessing or using Pleks you agree to be bound by these Terms of Service and our{" "}
          <a href="/privacy">Privacy Policy</a>. If you do not agree, you may not use the platform.
          These terms constitute a legally binding agreement between you and <strong>Pleks (Pty) Ltd</strong>,
          a company registered in the Republic of South Africa, concluded by data message under section 22 of the
          Electronic Communications and Transactions Act 25 of 2002 <span className="act-pill">ECT Act · S22</span>.
        </p>
        <p>
          If you are accepting these terms on behalf of an organisation, you confirm that you have authority to bind that
          organisation to these terms. Where the Consumer Protection Act 68 of 2008 <span className="act-pill">CPA</span> applies,
          these terms are subject to and interpreted in light of that Act.
        </p>
        <p><strong>Key definitions used in these terms:</strong></p>
        <ul className="legal-list">
          <li><strong>Platform</strong> — the Pleks software-as-a-service application, APIs, and associated tooling.</li>
          <li><strong>Subscriber / Agency</strong> — includes estate agencies, property practitioners, landlords, and any juristic or natural person subscribing to Pleks. Where an individual landlord subscribes, references to &ldquo;Agency&rdquo; apply to that individual.</li>
          <li><strong>Tenant / Applicant</strong> — a natural person who applies for or occupies a rental property managed through the platform.</li>
          <li><strong>Personal Information</strong> — as defined in POPIA s1 — information relating to an identifiable, living, natural person and, where applicable, an identifiable, existing juristic person.</li>
          <li><strong>Responsible Party</strong> — the party that determines the purpose and means of processing personal information; for Part B agency-management data, this is the Agency.</li>
          <li><strong>Operator</strong> — a party that processes personal information on behalf of a Responsible Party; Pleks is the Operator for Part B data.</li>
        </ul>
      </section>

      {/* 02 */}
      <section id="description">
        <p className="sec-num"><span className="bar" /><span>02 · Service description</span></p>
        <h2 className="sec-h">What <span className="hl">Pleks is</span></h2>
        <p>
          Pleks is a software-as-a-service (SaaS) property management platform designed for the South African market. It provides tools
          for managing rental properties, processing tenant applications, collecting rent, handling maintenance requests, conducting
          inspections, and generating compliance documentation.
        </p>
        <p>
          Pleks is <strong>not</strong>{" "}a property management company and does not act as a landlord, agent or intermediary in any
          property transaction. All decisions about tenants, leases, and property management remain entirely with you. Pleks (Pty) Ltd
          is a technology provider. Pleks does not perform any activity that would require it to be registered as a Property
          Practitioner under the Property Practitioners Act 22 of 2019 <span className="act-pill">PPA</span>, and does not hold, and
          is not required to hold, a Fidelity Fund Certificate.
        </p>
        <p>
          <strong>Trust funds.</strong> Pleks does not hold client funds. Trust money for rental management is held in the Agency&rsquo;s
          own Section 86 trust account at the Agency&rsquo;s own bank. Pleks is not a trustee and does not initiate or control
          payments on behalf of any party.
        </p>
      </section>

      {/* 03 */}
      <section id="subscription">
        <p className="sec-num"><span className="bar" /><span>03 · Subscription &amp; payment</span></p>
        <h2 className="sec-h">Subscription &amp; <span className="hl">payment</span></h2>
        <p>
          Access to Pleks requires a paid subscription. Subscription fees are billed on a recurring basis through our payment
          processor. By subscribing, you authorise the payment processor to charge your chosen payment method at the applicable
          billing interval. The current payment processor is listed in the operators directory at{" "}
          <a href="/popia-register">pleks.co.za/popia-register</a>.
        </p>
        <ul className="legal-list">
          <li>Prices are quoted in South African Rand (ZAR) and are inclusive of VAT where applicable.</li>
          <li>We reserve the right to change pricing with 30 days&rsquo; written notice to your registered email address.</li>
          <li>Applicant credit check fees are paid directly by the applicant at the time of their application — not by your agency subscription.</li>
          <li>Failed payments may result in temporary suspension of your account until the balance is settled.</li>
          <li>If you subscribe on an annual basis and are a natural person (not a juristic entity), we will notify you by email between 40 and 80 business days before your renewal date, as required by section 14 of the Consumer Protection Act <span className="act-pill">CPA · S14</span>. Agency and company subscribers are not subject to this notice obligation.</li>
        </ul>
      </section>

      {/* 04 */}
      <section id="cancellation">
        <p className="sec-num"><span className="bar" /><span>04 · Cancellation</span></p>
        <h2 className="sec-h">Cancelling <span className="hl">your subscription</span></h2>
        <p>
          You may cancel your subscription at any time from within your account settings. Upon cancellation, your subscription will remain
          active until the end of the current billing period. No pro-rated refunds are issued for partial billing periods except where required under applicable law.
        </p>
        <p>
          If you are a natural person within the meaning of the <span className="act-pill">CPA</span> and on a fixed-term agreement,
          you may also cancel the agreement at any time by giving at least 20 business days&rsquo; written notice to{" "}
          <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>. Pleks may impose a reasonable cancellation penalty calculated in
          accordance with regulation 5 of the CPA Regulations (<span className="act-pill">CPA · S14(2)(b)</span>). Agency and
          juristic-entity subscribers on fixed-term agreements are subject to any notice and penalty terms agreed at sign-up.
        </p>
        <p>
          After cancellation, you will retain <strong>read-only access</strong> to your data for 12 months. During this period you
          can use the bulk-export feature to download all leases, inspection reports, financial records, and tenant documents in a
          single archive. After the 12-month grace period, operational data is permanently deleted unless retention is required for
          legal, regulatory, or dispute-related purposes as set out below. Pleks is not responsible for data loss that results from
          failure to export within the grace period.
        </p>
        <p>
          <strong>Statutory retention after cancellation.</strong> Certain data categories are subject to mandatory retention
          obligations that continue after the 12-month grace period regardless of cancellation. These include trust records (Property
          Practitioners Act s54 + Regulation 33 — 5 years from the end of the financial year), tax records (Tax Administration Act
          s29 — 5 years), FICA records (FICA s23 — 5 years), audit logs (7 years), and consent records (10 years). During the
          extended retention period, that data is held in a restricted-access archive, used only for the legal obligation that
          requires its retention, and deleted at the end of the applicable window. The full retention schedule is published in the{" "}
          <a href="/popia-register">POPIA processing register</a>.
        </p>
      </section>

      {/* 05 */}
      <section id="prohibited">
        <p className="sec-num"><span className="bar" /><span>05 · Prohibited uses</span></p>
        <h2 className="sec-h">What you <span className="hl">may not do</span></h2>
        <p>You agree not to use Pleks for any purpose that is unlawful or prohibited by these terms. Without limitation, you may not:</p>
        <ul className="legal-list">
          <li>Use the platform to discriminate against prospective tenants on any grounds prohibited by South African law, including the Rental Housing Act <span className="act-pill">RHA</span>.</li>
          <li>Attempt to reverse-engineer, decompile, or extract the source code of the platform.</li>
          <li>Share your account credentials with third parties or allow unauthorised access to your account.</li>
          <li>Use the platform to store or transmit malicious code, spam, or unlawful content.</li>
          <li>Resell, sublicense, or redistribute access to the platform without our prior written consent.</li>
          <li>Use automated tools to scrape, crawl, or extract data from the platform at scale.</li>
        </ul>
        <p>
          You warrant that any personal information submitted to or processed through Pleks has been collected lawfully
          and is processed in compliance with applicable data protection legislation, including the Protection of Personal
          Information Act <span className="act-pill">POPIA</span>. You further warrant that you will not use the platform
          to engage in any discriminatory practice prohibited under the Rental Housing Act <span className="act-pill">RHA</span>,
          including unlawful discrimination against prospective tenants on any protected ground.
        </p>
        <p>
          <strong>Your indemnity to Pleks.</strong> You indemnify Pleks (Pty) Ltd against any claim, penalty, legal cost, or loss
          arising from unlawful collection, processing, or sharing of personal information by you as Responsible Party, or from any
          discriminatory practice, carried out through your use of the platform.
        </p>
        <p>
          <strong>Pleks&rsquo;s indemnity to you.</strong> Pleks indemnifies you against direct losses arising from Pleks&rsquo;s
          proven breach of its obligations as Operator under POPIA s20–s21 and §09 of these terms, subject to the limitation of
          liability in §06 (total liability capped at 12 months of fees paid), except that the cap does not apply to losses
          arising from Pleks&rsquo;s gross negligence or wilful breach.
        </p>
        <p>
          Breach of these conditions may result in immediate suspension or termination of your account without refund,
          and may expose you to civil or criminal liability.
        </p>
      </section>

      {/* 06 */}
      <section id="liability">
        <p className="sec-num"><span className="bar" /><span>06 · Limitation of liability</span></p>
        <h2 className="sec-h">Limitation of <span className="hl">liability</span></h2>
        <p>
          To the maximum extent permitted by South African law, Pleks (Pty) Ltd shall not be liable for any indirect,
          incidental, special, consequential or punitive damages arising out of or related to your use of the platform — including loss
          of data, loss of revenue, or loss of goodwill.
        </p>
        <p>
          Our total liability for any claim arising from these terms or your use of Pleks shall not exceed the total amount you paid to us
          in the <strong>12 months preceding the claim</strong>. The platform is provided &ldquo;as is&rdquo; and we make no warranties,
          express or implied, regarding its availability, accuracy or fitness for a particular purpose.
        </p>
        <p>
          Nothing in this clause limits liability for fraud, gross negligence, or any liability that cannot be excluded under
          applicable law including the <span className="act-pill">CPA</span>.
        </p>
        <p>
          <strong>Consumer subscribers (CPA).</strong> If you are a consumer within the meaning of the CPA, the limitations in this
          section apply only to the extent permitted by the CPA, and your statutory rights under sections 55, 56, and 61 of the CPA
          are not limited or excluded by anything in this clause.
        </p>
        <p>
          Pleks relies on third-party infrastructure providers — see the operators directory in the{" "}
          <a href="/popia-register">POPIA processing register</a> for the current list. Pleks is not liable for losses caused solely
          by failure, outage, or breach of those third-party service providers, except to the extent that such loss arises from
          Pleks&rsquo;s failure to exercise reasonable care in selecting, appointing, or managing those providers. See §08 for our
          service availability terms.
        </p>
      </section>

      {/* 07 */}
      <section id="governing">
        <p className="sec-num"><span className="bar" /><span>07 · Governing law</span></p>
        <h2 className="sec-h">Governing <span className="hl">law</span></h2>
        <p>
          These terms are governed by and construed in accordance with the laws of the Republic of South Africa. Without limiting any
          consumer&rsquo;s rights under the <span className="act-pill">CPA</span> to approach the National Consumer Tribunal, an
          accredited consumer ombud, the Magistrate&rsquo;s Court or the Small Claims Court, the parties consent to the jurisdiction
          of the Western Cape Division of the High Court of South Africa for any dispute that is heard in the High Court
          (<span className="act-pill">CPA · S69 · S115</span>).
        </p>
        <p>
          We prefer to resolve disputes amicably before going to court. If you have a complaint, please contact us first — we will respond within 10 business days.
        </p>
        <div className="officer-card">
          <span className="l">Legal<br />contact</span>
          <span className="v">
            Pleks (Pty) Ltd
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>

      {/* 08 */}
      <section id="availability">
        <p className="sec-num"><span className="bar" /><span>08 · Service availability</span></p>
        <h2 className="sec-h">Service <span className="hl">availability</span></h2>
        <p>
          We do not guarantee uninterrupted or error-free operation of the platform. Pleks may be temporarily
          unavailable due to scheduled maintenance, infrastructure updates, or circumstances beyond our control.
          We will endeavour to carry out scheduled maintenance during off-peak hours and to provide reasonable
          notice where possible.
        </p>
        <p>
          We target 99% monthly uptime for the authenticated dashboard. This target does not constitute a guaranteed
          Service Level Agreement (SLA) and does not create an entitlement to compensation or credit unless a separate SLA
          has been agreed in writing. Real-time platform status, including any active incidents and historical uptime, is
          published at{" "}
          <ExtLink href={EXTERNAL_LINKS.statusPage}>status.pleks.co.za</ExtLink>.
          You can check this page at any time to confirm whether a service disruption has been reported.
        </p>
        <p>
          Planned or unplanned downtime does not entitle you to a refund of subscription fees unless the
          disruption causes Pleks to fall materially below any service level expressly agreed in writing.
        </p>
      </section>

      {/* 09 */}
      <section id="dataprocessing">
        <p className="sec-num"><span className="bar" /><span>09 · Data processing — Pleks as Operator</span></p>
        <h2 className="sec-h">Data processing <span className="hl">obligations</span></h2>
        <p>
          This section constitutes the written data-processing terms required by sections 20 and 21 of the Protection of
          Personal Information Act <span className="act-pill">POPIA · S20</span>{" "}
          <span className="act-pill">POPIA · S21</span>. It governs Pleks&rsquo;s obligations as Operator when processing personal
          information on behalf of the Agency as Responsible Party (&ldquo;Part B&rdquo; processing as described in the{" "}
          <a href="/popia-register">POPIA processing register</a>). This section supplements, and does not replace, the privacy
          obligations set out in our <a href="/privacy">Privacy Policy</a> and the processing register.
        </p>

        <p><strong>09.1 — Instructions-only processing</strong></p>
        <p>
          Pleks will process personal information only on documented instructions from the Agency. The purpose entries in the POPIA
          processing register constitute the Agency&rsquo;s standing instructions for all standard platform operations. Pleks will
          not process Part B personal information for any purpose outside the register without the Agency&rsquo;s prior written
          consent, except where required by law — in which case Pleks will notify the Agency before processing unless prohibited
          from doing so.
        </p>

        <p><strong>09.2 — Security safeguards</strong></p>
        <p>
          Pleks will implement and maintain appropriate technical and organisational security measures consistent with{" "}
          <span className="act-pill">POPIA · S19</span> to protect personal information against accidental or unlawful destruction,
          loss, alteration, unauthorised disclosure, or access. These measures include AES-256 encryption at rest, TLS in transit,
          column-level encryption for sensitive fields, multi-factor authentication, and role-based access controls. Pleks will
          ensure that personnel with access to Part B data are bound by confidentiality obligations.
        </p>

        <p><strong>09.3 — Sub-processors</strong></p>
        <p>
          By subscribing, the Agency generally authorises Pleks to engage sub-processors listed in the operators directory of the{" "}
          <a href="/popia-register">POPIA processing register</a>. Before engaging a new sub-processor or materially changing an
          existing sub-processor&rsquo;s scope, Pleks will notify the Agency by email to the registered address at least 30 days
          in advance. The Agency may object in writing within that period; if no resolution is reached, the Agency may terminate
          the affected services without penalty. All sub-processors are bound by data-protection obligations at least as protective
          as those in this section.
        </p>

        <p><strong>09.4 — Breach notification</strong></p>
        <p>
          Pleks will notify the Agency <strong>without undue delay</strong> — and as a contractual commitment exceeding the POPIA
          s21 statutory baseline, <strong>within 72 hours</strong> of becoming aware — of any personal information breach affecting
          Part B data. For the purposes of this clause, &ldquo;becoming aware&rdquo; means the moment Pleks&rsquo;s
          incident-response process formally classifies an event as a personal information breach, not the moment any individual
          first observes anomalous activity. If complete information is not available within 72 hours, Pleks may provide a
          preliminary notification within the 72-hour window and supplement it with further updates as information becomes available.
          The notification will include, to the extent known at the time: (a) the nature of the breach and categories of personal
          information affected; (b) an estimate of the number of data subjects likely to be affected; (c) the likely consequences
          of the breach; and (d) the measures Pleks has taken or proposes to take to address the breach. The Agency must then
          independently assess whether its own <span className="act-pill">POPIA · S22</span> obligations to notify the Information
          Regulator and affected data subjects are triggered. The 72-hour window is a Pleks contractual obligation — POPIA s21
          requires only &ldquo;without undue delay.&rdquo;
        </p>

        <p><strong>09.5 — Audit rights</strong></p>
        <p>
          Agencies as Responsible Parties have the right to verify Pleks&rsquo;s compliance with these data-processing obligations.
          Pleks supports this right through: (a) this publicly available processing register and Terms of Service; (b) provision of
          a completed security questionnaire or equivalent on written request (at no cost, once per 12 months); and (c) cooperation
          with reasonable compliance audits on 30 days&rsquo; written notice. Audits under (c) are conducted at the Agency&rsquo;s
          cost, are limited to once per 12 months absent a documented incident, and may be conducted via questionnaire and remote
          review unless the Agency demonstrates a specific need for on-site inspection. All audits must be conducted in a manner that
          does not unreasonably interfere with Pleks&rsquo;s operations or compromise the security of other customers&rsquo; data.
        </p>

        <p><strong>09.6 — End-of-engagement data handling</strong></p>
        <p>
          Upon termination of the Agency&rsquo;s subscription and expiry of the 12-month read-only grace period (§04), Pleks will
          delete or anonymise all Part B personal information not subject to a statutory retention obligation. Statutory retention
          categories are set out in §04 and the processing register. At the Agency&rsquo;s written request, Pleks will provide a
          summary of what data categories are retained post-deletion and the applicable retention windows.
        </p>

        <p><strong>09.7 — Cooperation with data-subject requests</strong></p>
        <p>
          Pleks will promptly assist the Agency in fulfilling data-subject rights requests (access, correction, deletion, objection)
          to the extent technically practicable. Where a data subject submits a rights request directly to Pleks concerning Part B
          data, Pleks will route the request to the Agency within 5 business days for the Agency to respond as Responsible Party.
          Pleks will provide the Agency, within a timeframe that allows the Agency to meet its 30-calendar-day response obligation
          under POPIA s23 / PAIA s25, any information in Pleks&rsquo;s control that is necessary to respond to the request.
        </p>
      </section>

      {/* 10 */}
      <section id="general">
        <p className="sec-num"><span className="bar" /><span>10 · General provisions</span></p>
        <h2 className="sec-h">General <span className="hl">provisions</span></h2>
        <ul className="legal-list">
          <li><strong>Entire agreement.</strong> These terms — including the data-processing obligations in §09, which constitute the written Operator agreement required by POPIA s20–s21 — together with the Privacy Policy and the POPIA processing register (each incorporated by reference), constitute the entire agreement between the parties with respect to Pleks and supersede all prior agreements and understandings.</li>
          <li><strong>Severability.</strong> If any provision of these terms is found to be unenforceable or invalid under applicable law, that provision will be modified to the minimum extent necessary to make it enforceable, or severed if modification is not possible, and the remaining provisions will continue in full force.</li>
          <li><strong>Assignment.</strong> You may not assign or transfer your rights or obligations under these terms without Pleks&rsquo;s prior written consent. Pleks may assign these terms to a successor entity in connection with a merger, acquisition, or sale of all or substantially all of its assets, with notice to you.</li>
          <li><strong>Force majeure.</strong> Neither party will be liable for failure or delay in performance caused by circumstances beyond reasonable control, including acts of God, government action, internet infrastructure failure, or third-party service outages, except where the failure was caused or materially contributed to by Pleks&rsquo;s own act or omission. The affected party must give prompt notice and use reasonable efforts to resume performance.</li>
          <li><strong>Notices.</strong> Legal notices to Pleks must be sent to <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>. Notices from Pleks to you will be sent to your registered email address and are deemed delivered when sent.</li>
          <li><strong>Amendments.</strong> Pleks may update these terms from time to time. Material changes will be communicated by email at least 30 days before they take effect. Material changes include any change to fee structure, data-processing terms, limitation of liability, governing law, or termination rights. Non-material changes (typographical corrections, link updates, structural clarifications) take effect on publication and do not trigger the 30-day window. Continued use of the platform after the effective date of a material change constitutes acceptance of the updated terms.</li>
          <li>
            <strong>Survival.</strong> The following sections survive termination of these terms and any cancellation of your
            subscription: §04 (statutory retention obligations), §05 (indemnities), §06 (limitation of liability), §09 (data
            processing obligations, until all Part B data has been deleted or the applicable statutory retention window has closed),
            and §10 (general provisions).
          </li>
        </ul>
      </section>
    </LegalPageLayout>
  )
}
