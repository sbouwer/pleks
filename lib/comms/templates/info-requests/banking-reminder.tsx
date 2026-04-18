/**
 * info_request.banking_reminder — reminder to the owner that banking
 * details for owner statements are still outstanding.
 *
 * Kept explicit about the no-reply rule since banking info warrants extra
 * care; never invite the recipient to paste account numbers in email.
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

export interface BankingInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function BankingInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: BankingInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — banking details for ${propertyLabel}`
      : `Quick reminder — banking details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Banking details still needed</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is holding up owner statements for{" "}
            <Strong>{propertyLabel}</Strong> until the banking details are
            captured. Rental income received on your behalf can&apos;t be
            released to you without them.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on the banking details
            for owner statements on <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Enter banking details securely
      </EmailButton>

      <EmailParagraph>
        Please continue to use the secure form rather than replying with
        account details by email.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
