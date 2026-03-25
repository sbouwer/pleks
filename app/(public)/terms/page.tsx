import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service",
}

export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-12">Effective 1 April 2026</p>

      <div className="space-y-10">
        {/* PENDING: Replace "Pleks (Pty) Ltd" with registered company name + registration number once PTY is incorporated. Also add registered address. Contact: legal@pleks.co.za */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Acceptance</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            By accessing or using Pleks, you agree to be bound by these Terms of Service. If you do
            not agree to these terms, you may not use the platform. These terms constitute a legally
            binding agreement between you and Pleks (Pty) Ltd, a company registered in South Africa.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Description of service</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pleks is a software-as-a-service (SaaS) property management platform designed for the
            South African market. It provides tools for managing rental properties, processing tenant
            applications, collecting rent, handling maintenance requests, conducting inspections, and
            generating compliance documentation. Pleks is not a property management company and does
            not act as a landlord, agent, or intermediary in any property transaction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Subscription and payment</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Access to Pleks requires a paid subscription. Subscription fees are billed on a recurring
            basis through PayFast, our payment processor. By subscribing, you authorise PayFast to
            charge your chosen payment method at the applicable billing interval. Prices are quoted
            in South African Rand (ZAR) and are inclusive of VAT where applicable. We reserve the
            right to change pricing with 30 days&apos; written notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cancellation</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You may cancel your subscription at any time from within your account settings. Upon
            cancellation, your subscription will remain active until the end of the current billing
            period. After cancellation, you will retain read-only access to your data for 90 days.
            After this 90-day period, your data will be permanently deleted unless a longer retention
            period is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Prohibited uses</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            You agree not to use Pleks for any purpose that is unlawful or prohibited by these terms.
            Without limitation, you may not:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>Use the platform to discriminate against prospective tenants on any unlawful basis</li>
            <li>Attempt to reverse-engineer, decompile, or extract the source code of the platform</li>
            <li>Share your account credentials with third parties or allow unauthorised access</li>
            <li>Use the platform to store or transmit malicious code or content</li>
            <li>Resell, sublicense, or redistribute access to the platform without our written consent</li>
            <li>Use automated tools to scrape, crawl, or extract data from the platform</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Limitation of liability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the maximum extent permitted by South African law, Pleks (Pty) Ltd shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages arising
            out of or related to your use of the platform. Our total liability for any claim arising
            from these terms or your use of Pleks shall not exceed the total amount you paid to us in
            the 12 months preceding the claim. The platform is provided &ldquo;as is&rdquo; and we
            make no warranties, express or implied, regarding its availability, accuracy, or fitness
            for a particular purpose.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Governing law</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            These terms are governed by and construed in accordance with the laws of the Republic of
            South Africa. Any dispute arising from or relating to these terms shall be subject to the
            exclusive jurisdiction of the courts of the Western Cape Division of the High Court of
            South Africa. For any questions regarding these terms, please contact us at{" "}
            <a href="mailto:legal@pleks.co.za" className="text-foreground underline underline-offset-4 hover:text-primary">
              legal@pleks.co.za
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
