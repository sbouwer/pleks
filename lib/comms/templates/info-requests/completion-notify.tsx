/**
 * info_request.completion_notify — internal notification to the agency
 * user who initiated the info request, sent when the owner / broker /
 * scheme submits the form.
 *
 * Voice: neutral, platform-styled, succinct. Still uses agency branding
 * since the recipient is a user of a branded agency deployment.
 */

import * as React from "react"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import {
  EmailHeading,
  EmailParagraph,
  EmailSignoff,
  Strong,
} from "./shared"

export interface InfoRequestCompletionNotifyProps {
  branding: OrgBranding
  propertyLabel: string
  propertyUrl: string
  topicLabel: string
  /** e.g. "the owner" | "the broker at Safire Insurance" | "thabo@example.co.za" */
  submitterDisplay: string
}

export function InfoRequestCompletionNotify({
  branding,
  propertyLabel,
  propertyUrl,
  topicLabel,
  submitterDisplay,
}: InfoRequestCompletionNotifyProps) {
  const preview = `${submitterDisplay} has replied to your ${topicLabel.toLowerCase()} request`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Reply received</EmailHeading>

      <EmailParagraph>
        <Strong>{submitterDisplay}</Strong> has submitted their response
        to the <Strong>{topicLabel}</Strong> request on{" "}
        <Strong>{propertyLabel}</Strong>.
      </EmailParagraph>

      <EmailParagraph>
        The details have been captured against the property. Head to the
        property page to review what came in:
      </EmailParagraph>

      <EmailButton href={propertyUrl} accentColor={branding.accentColor}>
        Review the response
      </EmailButton>

      <EmailParagraph>
        No further action is needed from you unless the response triggers
        a downstream task (e.g. setting up debit orders once banking is
        confirmed).
      </EmailParagraph>

      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
