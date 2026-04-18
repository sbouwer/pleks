/**
 * info_request.documents — initial request for property documents
 * (title deed, CoCs, scheme rules, insurance cert, etc.).
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

export interface DocumentsInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
}

export function DocumentsInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
}: DocumentsInfoRequestEmailProps) {
  const preview = `Upload a few property documents for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>A few property documents</EmailHeading>

      <EmailParagraph>
        {branding.orgName} is setting up{" "}
        <Strong>{propertyLabel}</Strong> on their property management
        platform, and would appreciate a few documents on file. You only
        need to upload what you have — anything missing can be added
        later.
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Upload documents
      </EmailButton>

      <RequestList
        items={[
          "Title deed or proof of ownership",
          "Latest municipal rates account",
          "Insurance certificate or schedule",
          "Electrical compliance certificate (CoC), if available",
          "Gas, beetle, plumbing, or other CoCs that apply",
          "Scheme rules or conduct rules, if the property is in a scheme",
        ]}
      />

      <EmailParagraph>
        The form accepts PDFs, JPGs, and PNGs, up to 20 MB per file.
      </EmailParagraph>

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
