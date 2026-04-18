/**
 * info_request.landlord_reminder — reminder to the owner that landlord
 * details are still outstanding.
 *
 * firmness = 'polite' → first reminder (T+3 days in the cron cadence)
 * firmness = 'firm'   → subsequent reminders / org has tone_owner='firm'
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

export interface LandlordInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function LandlordInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: LandlordInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — owner details for ${propertyLabel}`
      : `Quick reminder — owner details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>We still need the owner details</EmailHeading>
          <EmailParagraph>
            {branding.orgName} hasn&apos;t yet received the owner details for{" "}
            <Strong>{propertyLabel}</Strong>. Without these, leases,
            statements, and other records can&apos;t be issued against the
            property.
          </EmailParagraph>
          <EmailParagraph>
            Please take a few minutes to complete the form:
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on the owner details for{" "}
            <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <EmailParagraph>
        If you&apos;ve already replied or there&apos;s been a mix-up, just
        let us know by replying to this email.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
