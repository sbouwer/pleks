/**
 * info_request.insurance_reminder — reminder for insurance details.
 *
 * Same recipientType split as the initial; same firmness split as other
 * reminders.
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
import type { InsuranceRecipientType } from "./insurance"

export interface InsuranceInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  recipientType: InsuranceRecipientType
  firmness: "polite" | "firm"
}

export function InsuranceInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  recipientType,
  firmness,
}: InsuranceInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — insurance details for ${propertyLabel}`
      : `Quick reminder — insurance details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>
            {recipientType === "broker"
              ? "Awaiting insurance confirmation"
              : "We still need the insurance details"}
          </EmailHeading>
          <EmailParagraph>
            {branding.orgName} hasn&apos;t yet received the insurance
            details for <Strong>{propertyLabel}</Strong>. Without them, we
            can&apos;t route broker notifications when an incident happens,
            or flag the property for annual renewal.
          </EmailParagraph>
          <EmailParagraph>
            Please take a couple of minutes to complete the form:
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on the insurance details
            for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <EmailParagraph>
        If the details have already been sent or the property isn&apos;t
        currently insured, just let us know by replying to this email.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
