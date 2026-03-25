import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Credit Check Policy",
}

export default function CreditCheckPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Credit Check Policy</h1>
      <p className="text-sm text-muted-foreground mb-12">Effective 1 April 2026</p>

      <div className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold mb-3">What checks are performed</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            When you apply for a rental property through Pleks, a comprehensive background and credit
            check may be performed as part of the application process. These checks include queries
            against the following sources:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">TransUnion</strong> — credit profile and payment
              history
            </li>
            <li>
              <strong className="text-foreground">XDS</strong> — credit bureau records and default
              listings
            </li>
            <li>
              <strong className="text-foreground">TPN</strong> — tenant payment performance data
            </li>
            <li>
              <strong className="text-foreground">Home Affairs</strong> — identity verification
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Who runs the checks</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All credit and background checks are conducted by{" "}
            <strong className="text-foreground">Searchworx</strong>, a registered credit bureau
            intermediary operating under the National Credit Act. Pleks does not access credit bureau
            data directly. Searchworx acts as our authorised service provider for this purpose and is
            bound by their own regulatory obligations regarding the handling of your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Fee</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A once-off fee of <strong className="text-foreground">R399</strong> is charged per credit
            check. This fee is paid by the applicant at the time of submitting their rental
            application. The fee is non-refundable once the credit check has been initiated, as the
            bureau queries are processed immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Legal basis under POPIA</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Credit checks are processed on the basis of your explicit consent, as provided for under
            section 11(1)(a) of the Protection of Personal Information Act (POPIA). Before any check
            is initiated, you will be asked to provide clear, informed consent. No credit check will
            be performed without this consent being obtained first.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Your rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            As the subject of a credit check, you have the following rights:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <li>
              You may request a free copy of the credit report generated as part of your application
            </li>
            <li>
              If you believe any information in the report is inaccurate, you may lodge a dispute
              directly with the relevant credit bureau (TransUnion, XDS, or TPN), who are required to
              investigate and respond within 20 business days
            </li>
            <li>
              You may also contact our Information Officer at{" "}
              <a href="mailto:info@pleks.co.za" className="text-foreground underline underline-offset-4 hover:text-primary">
                info@pleks.co.za
              </a>{" "}
              for assistance with the dispute process
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Withdrawal of consent</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Please note that once a credit check has been initiated and the bureau queries have been
            submitted, consent cannot be retrospectively withdrawn for that specific check. The data
            has already been accessed and a report generated. You may, however, withdraw consent for
            any future checks or processing of your information by contacting us at{" "}
            <a href="mailto:info@pleks.co.za" className="text-foreground underline underline-offset-4 hover:text-primary">
              info@pleks.co.za
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Retention</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Credit check results and associated personal information are retained for a period of 12
            months from the date the check was performed. After this period, the data is permanently
            deleted from our systems unless it forms part of an active lease record, in which case it
            is retained in accordance with our{" "}
            <a href="/privacy" className="text-foreground underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
