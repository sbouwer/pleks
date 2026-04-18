/**
 * info_request.scheme_reminder — reminder to a scheme contact whose
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

export interface SchemeInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function SchemeInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: SchemeInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Follow-up required — scheme contact details for ${propertyLabel}`
      : `Following up — scheme contact details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Follow-up on scheme contact details</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is still awaiting the scheme contact
            confirmation for <Strong>{propertyLabel}</Strong>. Without
            these, levy routing, rule notifications, and emergency contact
            flows can&apos;t be set up correctly.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Following up</EmailHeading>
          <ReminderMeta>A quick nudge on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still awaiting confirmation of the
            scheme contacts for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm scheme details
      </EmailButton>

      <EmailParagraph>
        If we&apos;ve contacted the wrong person or there&apos;s a newer
        managing agent, please let us know and we&apos;ll redirect.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
