/**
 * info_request.banking — initial request for banking details to pay
 * owner statements into. POPIA-sensitive; explicit purpose limitation
 * in the body.
 *
 * Recipient: owner.
 */

import * as React from "react"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import {
  EmailHeading,
  EmailParagraph,
  EmailSignoff,
  ExpiryLine,
  POPIALine,
  RequestList,
  Strong,
} from "./shared"

export interface BankingInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
}

export function BankingInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
}: BankingInfoRequestEmailProps) {
  const preview = `Confirm banking details for owner statements on ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Confirm banking details</EmailHeading>

      <EmailParagraph>
        {branding.orgName} is setting up{" "}
        <Strong>{propertyLabel}</Strong> on their property management
        platform. To pay rental income through to you correctly, we need
        the banking details for your owner statements.
      </EmailParagraph>

      <EmailParagraph>
        Please enter your banking details using the secure form — the
        account number is encrypted on submission and stored securely:
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Enter banking details securely
      </EmailButton>

      <RequestList
        items={[
          "Bank name",
          "Account holder name (as it appears on your bank statement)",
          "Account number",
          "Branch code",
          "Account type (cheque, savings, transmission)",
        ]}
      />

      <EmailParagraph>
        These details are used only to pay your owner statement amounts
        and will not be shared outside of {branding.orgName} and its
        payment processor.
      </EmailParagraph>

      <EmailParagraph>
        Please do not reply to this email with your banking details.
        The secure form above is the only safe channel.
      </EmailParagraph>

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
