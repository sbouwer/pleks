/**
 * app/(public)/terms/page.tsx — Terms of service for Pleks
 *
 * Route:  /terms
 * Auth:   public
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"

export const metadata: Metadata = {
  title: "Terms of Service — Pleks",
  description: "The agreement that governs your use of the Pleks property management platform.",
}

const SECTIONS = [
  { id: "acceptance",    num: "01", label: "Acceptance"            },
  { id: "description",   num: "02", label: "Description of service"},
  { id: "subscription",  num: "03", label: "Subscription & payment"},
  { id: "cancellation",  num: "04", label: "Cancellation"          },
  { id: "prohibited",    num: "05", label: "Prohibited uses"       },
  { id: "liability",     num: "06", label: "Limitation of liability"},
  { id: "governing",     num: "07", label: "Governing law"         },
  { id: "availability",  num: "08", label: "Service availability"  },
]

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      eyebrowParts={["SaaS · TERMS", "binding agreement", "v2.9"]}
      titleBefore="Terms of"
      titleHighlight="service"
      subtitle="The agreement that governs your use of the Pleks property management platform. By using Pleks you confirm that you have read and accepted these terms."
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 05", mono: true },
        { label: "Effective",     value: "2026 · 05 · 05", mono: true },
        { label: "Jurisdiction",  value: "Republic of South Africa" },
        { label: "Framework",     value: "CPA · ECT Act · PPA" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel="END · TERMS OF SERVICE · v2.9"
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What you&rsquo;re agreeing to</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>By using Pleks you accept these terms — they form a legally binding agreement with Pleks (Pty) Ltd.</span></li>
          <li><span className="b" /><span>Subscription fees are billed monthly or annually via PayFast, in ZAR inclusive of VAT where applicable.</span></li>
          <li><span className="b" /><span>Cancel at any time from your account settings; access continues until your billing period ends.</span></li>
          <li><span className="b" /><span>After cancellation you have 90 days of read-only access before your data is permanently deleted.</span></li>
          <li><span className="b" /><span>Pleks is governed by South African law; disputes go to the Western Cape Division of the High Court.</span></li>
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
          a company registered in the Republic of South Africa.
        </p>
        <p>
          If you are accepting these terms on behalf of an organisation, you confirm that you have authority to bind that
          organisation to these terms. Where the Consumer Protection Act 68 of 2008 <span className="act-pill">CPA</span> applies,
          these terms are subject to and interpreted in light of that Act.
        </p>
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
          is a technology provider and is not a &ldquo;Property Practitioner&rdquo; as defined in the Property Practitioners Act 22
          of 2019 <span className="act-pill">PPA</span>. Pleks does not hold, and is not required to hold, a Fidelity Fund Certificate.
        </p>
      </section>

      {/* 03 */}
      <section id="subscription">
        <p className="sec-num"><span className="bar" /><span>03 · Subscription &amp; payment</span></p>
        <h2 className="sec-h">Subscription &amp; <span className="hl">payment</span></h2>
        <p>
          Access to Pleks requires a paid subscription. Subscription fees are billed on a recurring basis through PayFast, our payment
          processor. By subscribing, you authorise PayFast to charge your chosen payment method at the applicable billing interval.
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
          active until the end of the current billing period. No pro-rated refunds are issued for partial billing periods.
        </p>
        <p>
          After cancellation, you will retain <strong>read-only access</strong> to your data for 90 days. During this period you
          can use the bulk-export feature to download all leases, inspection reports, financial records, and tenant documents in a
          single archive. After the 90-day grace period your data will be permanently deleted unless a longer retention period is
          required by law — see our <a href="/privacy">Privacy Policy</a> for the full retention schedule. Pleks is not responsible
          for data loss that results from failure to export within the grace period.
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
          including unlawful discrimination against prospective tenants on any protected ground. You indemnify Pleks (Pty) Ltd
          against any claim, penalty, legal cost, or loss arising from unlawful collection, processing, or sharing of personal
          information, or from any discriminatory practice, carried out through your use of the platform.
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
          applicable law including the <span className="act-pill">CPA</span>. Pleks relies on third-party infrastructure providers
          including Supabase, Vercel, and PayFast. We are not liable for any loss or interruption caused by failure, outage, or
          breach of those third-party services beyond what is recoverable under our agreements with them. See section 08 for our
          service availability terms.
        </p>
      </section>

      {/* 07 */}
      <section id="governing">
        <p className="sec-num"><span className="bar" /><span>07 · Governing law</span></p>
        <h2 className="sec-h">Governing <span className="hl">law</span></h2>
        <p>
          These terms are governed by and construed in accordance with the laws of the Republic of South Africa. Any dispute arising from
          or relating to these terms shall be subject to the exclusive jurisdiction of the courts of the Western Cape Division of the High
          Court of South Africa.
        </p>
        <p>
          We prefer to resolve disputes amicably before going to court. If you have a complaint, please contact us first — we will respond within 10 business days.
        </p>
        <div className="officer-card">
          <span className="l">Legal<br />contact</span>
          <span className="v">
            Pleks (Pty) Ltd{" "}
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
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
          <a href="https://status.pleks.co.za" target="_blank" rel="noopener noreferrer">status.pleks.co.za</a>.
          You can check this page at any time to confirm whether a service disruption has been reported.
        </p>
        <p>
          Planned or unplanned downtime does not entitle you to a refund of subscription fees unless the
          disruption causes Pleks to fall materially below any service level expressly agreed in writing.
        </p>
      </section>
    </LegalPageLayout>
  )
}
