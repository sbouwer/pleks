import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-12">Effective 1 April 2026</p>

      <div className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold mb-3">Who we are</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pleks is a property management platform operated by Tohi Group PTY LTD, a company
            registered in South Africa. Our registered address is 13 Station Street, Paarl.
            We provide software tools to property managers, landlords, tenants, and rental
            applicants across South Africa.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">What we collect</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Depending on how you interact with Pleks, we may collect the following personal
            information:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>Full name and contact details (email address, phone number, physical address)</li>
            <li>Identity or passport number for verification purposes</li>
            <li>Banking details for rent collection and owner payouts</li>
            <li>
              Credit information, collected only with your explicit consent, for the purpose of
              assessing rental applications
            </li>
            <li>Employment and income information provided during the application process</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Why we collect it</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We process your personal information for the following purposes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>Processing and evaluating rental applications</li>
            <li>Collecting rent and managing payment records</li>
            <li>Reporting financial information to property owners</li>
            <li>Communicating with you about your lease, payments, or maintenance</li>
            <li>Complying with our legal obligations under South African law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Who we share your information with</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We share personal information only with trusted third-party service providers who
            assist us in delivering our services:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">Searchworx</strong> — a registered credit bureau
              intermediary that performs credit and background checks on rental applicants
            </li>
            <li>
              <strong className="text-foreground">PayFast</strong> — our payment processor, used to
              collect subscription fees and facilitate rent payments
            </li>
            <li>
              <strong className="text-foreground">DocuSeal</strong> — used to generate, send, and
              electronically sign lease agreements and other documents
            </li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            We do not sell your personal information to any third party.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Retention</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We retain personal information only for as long as necessary to fulfil the purpose for
            which it was collected, or as required by law:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>Rental applications — 12 months from the date of submission</li>
            <li>Lease records — 5 years after the end of the lease term</li>
            <li>Financial records — 7 years, as required by the South African Revenue Service (SARS)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Your rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Under the Protection of Personal Information Act (POPIA), you have the right to:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>Request access to the personal information we hold about you</li>
            <li>Request correction of inaccurate or incomplete information</li>
            <li>Request deletion of your personal information, subject to legal retention requirements</li>
            <li>Object to the processing of your personal information on reasonable grounds</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            To exercise any of these rights, please contact our Information Officer using the details
            below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Information Officer</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our designated Information Officer can be contacted at{" "}
            <a href="mailto:info@pleks.co.za" className="text-foreground underline underline-offset-4 hover:text-primary">
              info@pleks.co.za
            </a>
            . All requests related to your personal information will be responded to within a
            reasonable time, and no later than 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Complaints</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you are not satisfied with how we have handled your personal information, you have the
            right to lodge a complaint with the Information Regulator of South Africa. You can contact
            them through their website at{" "}
            <a
              href="https://inforeg.org.za"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              inforeg.org.za
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
