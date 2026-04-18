/**
 * info_request.compliance_reminder — reminder for compliance certificate
 * details.
 */

import * as React from "react"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import {
  EmailHeading,
  EmailParagraph,
  EmailSignoff,
  ExpiryLine,
  ReminderMeta,
  Strong,
} from "./shared"

export interface ComplianceInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function ComplianceInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: ComplianceInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — compliance details for ${propertyLabel}`
      : `Quick reminder — compliance details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Compliance details still outstanding</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is still waiting on compliance certificate
            details for <Strong>{propertyLabel}</Strong>. Without expiry
            dates on file, the platform can&apos;t warn you when renewals
            fall due.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on the compliance
            certificate details for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm compliance details
      </EmailButton>

      <EmailParagraph>
        If the property doesn&apos;t carry a certain certificate, the
        form accepts a &quot;not applicable&quot; answer — no separate
        reply needed.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
