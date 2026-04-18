/**
 * info_request.scheme — initial request to a managing scheme / body
 * corporate / HOA contact, peer-to-peer professional voice.
 *
 * Recipient: scheme managing agent or trustee whose email the agency
 * user captured or knows.
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

export interface SchemeInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  /** e.g. "Blue Vista Body Corporate" — if known */
  schemeName?: string
}

export function SchemeInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
  schemeName,
}: SchemeInfoRequestEmailProps) {
  const preview = `Scheme contact details requested for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Scheme contact details</EmailHeading>

      <EmailParagraph>
        {branding.orgName} manages a unit at{" "}
        <Strong>{propertyLabel}</Strong>
        {schemeName ? (
          <>
            {" "}under <Strong>{schemeName}</Strong>
          </>
        ) : null}
        , and is setting the property up on a property management platform.
      </EmailParagraph>

      <EmailParagraph>
        To keep levies, rules, and scheme communication lined up correctly,
        we&apos;d appreciate confirmation of the right scheme contacts on
        file:
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm scheme details
      </EmailButton>

      <RequestList
        items={[
          "Managing agent name and email",
          "Trustee chair or primary contact, if different",
          "After-hours contact for common-area emergencies",
          "Any change-of-tenancy notification process we should follow",
        ]}
      />

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
