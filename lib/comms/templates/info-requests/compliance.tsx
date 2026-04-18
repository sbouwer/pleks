/**
 * info_request.compliance — initial request for compliance certificate
 * details (electrical, gas, beetle, pool, lift — whichever apply).
 *
 * Recipient: owner. Kept lightly distinct from documents by asking for
 * structured details (issuer, date, expiry) rather than just the file.
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

export interface ComplianceInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
}

export function ComplianceInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
}: ComplianceInfoRequestEmailProps) {
  const preview = `Compliance certificate details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Compliance certificate details</EmailHeading>

      <EmailParagraph>
        {branding.orgName} is setting up{" "}
        <Strong>{propertyLabel}</Strong> on their property management
        platform, and needs to capture the compliance certificates on
        record so renewal reminders can be set correctly.
      </EmailParagraph>

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Confirm compliance details
      </EmailButton>

      <RequestList
        items={[
          "Electrical compliance certificate (CoC) — issue date and expiry",
          "Gas CoC, if the property has a gas installation",
          "Beetle or borer certificate, if one was issued at sale",
          "Pool compliance, where a pool is on the property",
          "Lift inspection certificate, where applicable",
          "Any other municipal or safety certificate the property carries",
        ]}
      />

      <EmailParagraph>
        For each item you have, the form lets you upload the certificate
        and capture the issuer and expiry date. Anything you don&apos;t
        have can be marked as &quot;not applicable&quot; or left for
        later.
      </EmailParagraph>

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
