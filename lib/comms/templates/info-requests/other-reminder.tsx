/**
 * info_request.other_reminder — reminder for the generic / free-form
 * info request.
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

export interface OtherInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
  prompt?: string
}

export function OtherInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
  prompt,
}: OtherInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — information for ${propertyLabel}`
      : `Quick reminder — information for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Still need the information</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is still waiting on the information
            requested for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on the information
            requested for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      {prompt ? (
        <EmailParagraph>
          <em>&ldquo;{prompt}&rdquo;</em>
        </EmailParagraph>
      ) : null}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
