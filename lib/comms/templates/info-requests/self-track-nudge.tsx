/**
 * info_request.self_track_nudge — internal reminder sent to the agency
 * user who, when creating the property, chose "I'll ask later" on an
 * outstanding info topic (self track).
 *
 * Fires T+30 days by default from the property_info_requests cron.
 * Not POPIA-sensitive (internal to the agency); no external PII.
 */

import * as React from "react"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import {
  EmailHeading,
  EmailParagraph,
  EmailSignoff,
  Strong,
} from "./shared"

export interface InfoRequestSelfTrackNudgeProps {
  branding: OrgBranding
  propertyLabel: string
  propertyUrl: string
  topicLabel: string
  daysElapsed?: number
}

export function InfoRequestSelfTrackNudge({
  branding,
  propertyLabel,
  propertyUrl,
  topicLabel,
  daysElapsed = 30,
}: InfoRequestSelfTrackNudgeProps) {
  const preview = `Still outstanding: ${topicLabel.toLowerCase()} for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Outstanding on your list</EmailHeading>

      <EmailParagraph>
        About {daysElapsed} days ago you flagged that you&apos;d follow up
        on the <Strong>{topicLabel}</Strong> for{" "}
        <Strong>{propertyLabel}</Strong> yourself.
      </EmailParagraph>

      <EmailParagraph>
        If that&apos;s still on your list, the property page has the
        completeness widget ready to either log the details directly or
        forward a request to the owner:
      </EmailParagraph>

      <EmailButton href={propertyUrl} accentColor={branding.accentColor}>
        Open the property
      </EmailButton>

      <EmailParagraph>
        If this isn&apos;t relevant anymore, dismiss it from the widget
        and we won&apos;t nudge again.
      </EmailParagraph>

      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
