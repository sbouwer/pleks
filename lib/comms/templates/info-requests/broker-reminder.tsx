/**
 * info_request.broker_reminder — reminder to a broker whose coverage
 * confirmation is outstanding.
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

export interface BrokerInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function BrokerInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: BrokerInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Follow-up required — coverage confirmation for ${propertyLabel}`
      : `Following up — coverage confirmation for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Follow-up on coverage confirmation</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is still awaiting confirmation of current
            coverage on <Strong>{propertyLabel}</Strong>. Completing the
            form below enables incident and renewal routing on this file.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Following up</EmailHeading>
          <ReminderMeta>A quick nudge on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still awaiting the coverage confirmation
            for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm coverage details
      </EmailButton>

      <EmailParagraph>
        If you&apos;ve already replied directly or the property is no
        longer on your books, a brief reply will help us update the record.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
