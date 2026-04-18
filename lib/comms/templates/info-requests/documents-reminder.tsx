/**
 * info_request.documents_reminder — reminder to upload property documents.
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

export interface DocumentsInfoRequestReminderProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  firmness: "polite" | "firm"
}

export function DocumentsInfoRequestReminder({
  branding,
  propertyLabel,
  secureUrl,
  firmness,
}: DocumentsInfoRequestReminderProps) {
  const preview =
    firmness === "firm"
      ? `Action needed — documents for ${propertyLabel}`
      : `Quick reminder — documents for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      {firmness === "firm" ? (
        <>
          <EmailHeading>Property documents still outstanding</EmailHeading>
          <EmailParagraph>
            {branding.orgName} is still waiting on property documents for{" "}
            <Strong>{propertyLabel}</Strong>. Upload what you have — the
            record stays incomplete without them.
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailHeading>Quick reminder</EmailHeading>
          <ReminderMeta>Following up on our earlier email.</ReminderMeta>
          <EmailParagraph>
            {branding.orgName} is still waiting on a few property documents
            for <Strong>{propertyLabel}</Strong>.
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Upload documents
      </EmailButton>

      <EmailParagraph>
        If a document isn&apos;t available or doesn&apos;t apply to this
        property, just let us know and we&apos;ll mark it accordingly.
      </EmailParagraph>

      <ExpiryLine />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
