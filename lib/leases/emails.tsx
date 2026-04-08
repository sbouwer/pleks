/**
 * Lease lifecycle emails — CPA renewal notice, etc.
 * Called from cron routes and lease action server actions.
 */

import { EmailLayout, EmailSectionHeading, EmailDetail } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import { sendEmail } from "@/lib/comms/send-email"

const S = {
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  warning: { fontSize: 14, color: "#b45309", lineHeight: "1.6", margin: "0 0 8px", fontWeight: 600 as const },
} as const

interface OrgContact {
  orgId: string
  orgName: string
  orgPhone?: string
  orgEmail?: string
  branding: OrgBranding
}

export async function sendLeaseRenewalNotice(
  tenant: { email: string; name: string },
  lease: { id: string; endDate: string; propertyName: string; unitLabel: string },
  org: OrgContact
) {
  const endDate = new Date(lease.endDate).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })

  return sendEmail({
    orgId: org.orgId,
    templateKey: "lease.renewal_notice",
    to: { email: tenant.email, name: tenant.name },
    subject: `Important: Your lease renewal — ${lease.unitLabel}, ${lease.propertyName}`,
    emailElement: (
      <EmailLayout
        preview={`Your lease at ${lease.propertyName} expires on ${endDate} — action may be required`}
        branding={org.branding}
      >
        <p style={S.body}>Dear {tenant.name},</p>
        <p style={S.body}>
          This notice is sent in accordance with section 14 of the Consumer Protection Act 68 of 2008.
        </p>
        <EmailSectionHeading>Your lease details</EmailSectionHeading>
        <EmailDetail label="Property" value={`${lease.unitLabel} — ${lease.propertyName}`} />
        <EmailDetail label="Lease end date" value={endDate} />
        <EmailSectionHeading>What this means for you</EmailSectionHeading>
        <p style={S.body}>
          Your fixed-term lease expires on <strong>{endDate}</strong>. Under the Consumer Protection Act,
          your lease will automatically convert to a month-to-month tenancy on that date unless either party
          gives notice of non-renewal.
        </p>
        <p style={S.warning}>
          If you do not wish to continue renting after {endDate}, you must give written notice now.
          Please contact {org.orgName} as soon as possible.
        </p>
        <EmailSectionHeading>Your options</EmailSectionHeading>
        <p style={S.body}>
          <strong>Continue month-to-month:</strong> No action needed. Your tenancy will continue under
          the same terms until either party gives one calendar month&apos;s written notice.
        </p>
        <p style={S.body}>
          <strong>Renew for a fixed term:</strong> Contact {org.orgName} to discuss a lease renewal.
        </p>
        <p style={S.body}>
          <strong>Vacate on expiry:</strong> Give written notice to {org.orgName} immediately.
        </p>
        <p style={{ fontSize: 13, color: "#71717a", margin: "16px 0 0" }}>
          Contact {org.orgName}
          {org.orgPhone ? ` · ${org.orgPhone}` : ""}
          {org.orgEmail ? ` · ${org.orgEmail}` : ""}
        </p>
      </EmailLayout>
    ),
    bodyPreview: `Your lease at ${lease.propertyName} expires ${endDate}. CPA s14 renewal notice — action may be required.`,
    entityType: "lease",
    entityId: lease.id,
  })
}
