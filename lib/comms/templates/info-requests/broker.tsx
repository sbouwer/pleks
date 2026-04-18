/**
 * info_request.broker — initial request sent to an insurance broker,
 * peer-to-peer professional voice.
 *
 * Recipient: broker contact (email captured on the property's broker record).
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

export interface BrokerInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  /** If the agency has the client's name, surface it */
  ownerName?: string
}

export function BrokerInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
  ownerName,
}: BrokerInfoRequestEmailProps) {
  const preview = `Coverage confirmation requested for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Coverage confirmation requested</EmailHeading>

      <EmailParagraph>
        {branding.orgName} manages <Strong>{propertyLabel}</Strong>
        {ownerName ? (
          <>
            {" "}on behalf of <Strong>{ownerName}</Strong>
          </>
        ) : null}
        , and is setting up the property on a property management platform.
      </EmailParagraph>

      <EmailParagraph>
        To route incident notifications to the right inbox and keep renewal
        dates aligned, we&apos;d appreciate your confirmation of the current
        coverage on file:
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm coverage details
      </EmailButton>

      <RequestList
        items={[
          "Insurer name and policy number",
          "Replacement value and annual renewal date",
          "Preferred broker contact name and email for incident notifications",
          "Direct phone line for after-hours claims, if available",
        ]}
      />

      <EmailParagraph>
        Authorisation to disclose these details should be on record with
        your client; if you&apos;d prefer to confirm with them first, please
        do reach out directly.
      </EmailParagraph>

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
