/**
 * info_request.landlord — initial request to the agency's user asking for
 * owner / landlord details on a property that was created without a linked
 * landlord contact.
 *
 * Recipient: the owner contact the agency captured OR an email address the
 * agency user typed into the "I'll add the owner later" flow.
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

export interface LandlordInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
}

export function LandlordInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
}: LandlordInfoRequestEmailProps) {
  const preview = `Confirm the owner details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Confirm the owner details</EmailHeading>

      <EmailParagraph>
        {branding.orgName} is setting up{" "}
        <Strong>{propertyLabel}</Strong> in their property management
        platform, and needs to confirm a few owner details before the setup
        can be finalised.
      </EmailParagraph>

      <EmailParagraph>
        This should take about two minutes:
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <RequestList
        items={[
          "Your full name, or company name if the property is held by an entity",
          "Preferred contact email and phone",
          "Postal address, if different from the property",
        ]}
      />

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
