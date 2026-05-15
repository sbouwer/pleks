/**
 * app/(public)/privacy/information-officer/page.tsx — Pleks Information Officer + IR contact
 *
 * Route:  /privacy/information-officer
 * Auth:   public
 * Notes:  D-POPIA-19: POPIA s73(2) — IO details must be disclosed when subjects exercise rights.
 *         This page covers Pleks as Responsible Party for platform account data.
 *         Each agency has its own IO in /settings/privacy/information-officer.
 */
import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Mail, Phone, MapPin } from "lucide-react"

export const metadata: Metadata = {
  title: "Information Officer — Pleks",
  description: "Contact details for the Pleks Information Officer and the Information Regulator of South Africa.",
}

export default function InformationOfficerPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          POPIA s73(2)
        </p>
        <h1 className="text-3xl font-heading font-semibold mb-3">Information Officer</h1>
        <p className="text-muted-foreground text-sm">
          The Pleks Information Officer handles data-subject requests relating to data Pleks
          holds as Responsible Party (your platform account, login history, and session data).
          For data held by an agency, contact that agency&apos;s Information Officer directly.
        </p>
      </div>

      {/* Pleks IO */}
      <div className="border rounded-lg p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Pleks (Pty) Ltd — Information Officer
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <a href="mailto:privacy@pleks.co.za" className="underline">privacy@pleks.co.za</a>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              Pleks (Pty) Ltd, Republic of South Africa
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pleks is a registered company in the Republic of South Africa. The Information Officer
          is responsible for ensuring compliance with POPIA and for handling requests from data
          subjects whose platform account data is processed by Pleks.
        </p>
      </div>

      {/* How to exercise rights */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">How to exercise your rights</h2>
        <p className="text-sm text-muted-foreground">
          If you have a Pleks account, you can exercise your POPIA rights directly through
          your portal:
        </p>
        <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
          <li>Tenant portal: <Link href="/tenant/privacy" className="underline text-foreground">Your data &amp; privacy</Link></li>
          <li>Landlord portal: <Link href="/landlord/privacy" className="underline text-foreground">Your data &amp; privacy</Link></li>
          <li>Supplier portal: <Link href="/supplier/privacy" className="underline text-foreground">Your data &amp; privacy</Link></li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Alternatively, email <a href="mailto:privacy@pleks.co.za" className="underline">privacy@pleks.co.za</a>{" "}
          with your full name, email address, and a description of your request. We will respond
          within 30 calendar days as required by POPIA s23(1).
        </p>
      </div>

      {/* Information Regulator */}
      <div className="border rounded-lg p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Information Regulator of South Africa
        </p>
        <p className="text-sm text-muted-foreground">
          If you do not receive a response within 30 days, or you are dissatisfied with the
          outcome of your request, you have the right to complain to the Information Regulator.
          This right is unconditional.
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <a href="mailto:complaints.IR@justice.gov.za" className="underline">
              complaints.IR@justice.gov.za
            </a>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <a href="tel:+27100235207" className="underline">+27 10 023 5207</a>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
            </span>
          </div>
          <div className="flex items-start gap-2">
            <ExternalLink className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <a
              href="https://www.justice.gov.za/inforeg/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              www.justice.gov.za/inforeg
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
