/**
 * app/(public)/contact/page.tsx — public contact page (direct-line copy + ContactForm)
 *
 * Route:  /contact
 * Auth:   Public
 */
import { Suspense } from "react"
import Link from "next/link"
import { ContactForm } from "./ContactForm"
import { PropertyOperationsNetworkSVG } from "@/app/(public)/svgs/PropertyOperationsNetworkSVG"
import { AccentBracket } from "@/components/ui/AccentBracket"

export const metadata = {
  title: "Contact — Pleks",
  description: "Drop your details. Stéan reads every message and replies the same working day.",
}

// Phone number is formatted once, used in three places (visible label, tel: link, WhatsApp link)
const PHONE_DISPLAY = "+27 69 039 5829"
const PHONE_TEL = "+27690395829"
// WhatsApp uses E.164 without the leading + or spaces
const WHATSAPP_NUMBER = "27690395829"

export default function ContactPage() {
  return (
    <section className="pub-contact">
      {/* Background — subtle property-operations network */}
      <PropertyOperationsNetworkSVG />

      <div className="pub-wrap" style={{ position: "relative", zIndex: 1 }}>

        {/* Eyebrow + header */}
        <div className="pub-contact-head">
          <div className="pub-eyebrow" style={{ marginBottom: 14 }}>
            <span className="amber-rule" />Direct line
          </div>
          <h1 className="pub-h1" style={{ margin: "0 0 16px", maxWidth: "24ch" }}>
            Drop your details, I&apos;ll be in touch the{" "}
            <span className="amber-wash-underline">same working day.</span>
          </h1>
          <p className="pub-body-lg" style={{ margin: 0, maxWidth: "56ch" }}>
            Pleks is small enough that the founder reads every message himself. No SDR, no ticketing system,
            no chase-up sequence. You write, I reply — usually within hours, always within the day.
          </p>
        </div>

        {/* Two-column body — personal details on left, form on right */}
        <div className="pub-contact-grid">

          {/* Left column — personal block */}
          <aside className="pub-contact-personal">
            <div className="pub-contact-name-block">
              <span className="stoep pub-contact-name">St&eacute;an Bouwer</span>
              <span className="pub-contact-role">Founder, Plek<AccentBracket>s</AccentBracket></span>
              <span className="pub-contact-meta">Western Cape &middot; ZA business hours</span>
            </div>

            <div className="pub-contact-channels">
              <div className="pub-contact-channel">
                <span className="pub-contact-channel-label">Direct line</span>
                <span className="pub-contact-channel-row">
                  <a href={`tel:${PHONE_TEL}`} className="pub-contact-channel-value">
                    {PHONE_DISPLAY}
                  </a>
                  <span className="pub-contact-channel-aside">
                    or{" "}
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pub-contact-whatsapp-link"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "-2px", marginRight: 4 }} aria-hidden="true">
                        <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.099-.473-.15-.673.15-.197.297-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 0 1-1.516-5.26c0-5.445 4.455-9.885 9.942-9.885a9.86 9.86 0 0 1 7.022 2.91 9.825 9.825 0 0 1 2.901 7.022c-.004 5.444-4.46 9.885-9.935 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 0 0 5.71 1.447h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411"/>
                      </svg>
                      WhatsApp
                    </a>
                  </span>
                </span>
              </div>
            </div>

            <div className="pub-contact-aside">
              <p>
                If you&apos;re an existing customer with something broken, the in-app support thread reaches me too —
                but for first contact, here works.
              </p>
              <p>
                I prefer to reply by email first so there&apos;s a paper trail, then jump on a call if it&apos;s easier.
                I don&apos;t do unsolicited cold calls — if I&apos;m calling, it&apos;s because we agreed.
              </p>
            </div>

            <Link href="/" className="pub-contact-back">
              ← Back to the homepage
            </Link>
          </aside>

          {/* Right column — form */}
          <div className="pub-contact-form-wrap">
            <Suspense>
              <ContactForm />
            </Suspense>
          </div>

        </div>

      </div>
    </section>
  )
}
