/**
 * info_request.other — generic free-form info request. Used when the
 * agency has marked the property with a bespoke question that doesn't
 * fit any of the structured topics.
 *
 * Recipient: owner (typically).
 */

import * as React from "react"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import {
  EmailHeading,
  EmailParagraph,
  EmailSignoff,
  ExpiryLine,
  POPIALine,
  Strong,
} from "./shared"

export interface OtherInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  /** Free-form prompt entered by the agency user when creating the request */
  prompt?: string
}

export function OtherInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
  prompt,
}: OtherInfoRequestEmailProps) {
  const preview = `Information requested for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>A quick request for some information</EmailHeading>

      <EmailParagraph>
        {branding.orgName} is setting up{" "}
        <Strong>{propertyLabel}</Strong> on their property management
        platform, and has a few specific questions about the property
        they&apos;d appreciate your help with.
      </EmailParagraph>

      {prompt ? (
        <EmailParagraph>
          <em>&ldquo;{prompt}&rdquo;</em>
        </EmailParagraph>
      ) : null}

      <EmailParagraph>
        The secure form below has space to answer or upload anything
        relevant:
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
