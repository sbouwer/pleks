/**
 * info_request.insurance — initial request for insurance policy details.
 *
 * Recipient track is set on the property_info_requests row:
 *   recipientType='owner'  → default, most common
 *   recipientType='broker' → when the agency user said "ask my broker"
 *
 * Content and voice shift slightly between the two: owner gets a friendly
 * explain-what-we-need voice; broker gets a peer-to-peer professional voice.
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

export type InsuranceRecipientType = "owner" | "broker"

export interface InsuranceInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  recipientType: InsuranceRecipientType
  /** If the broker knows the client by name, include it in the intro */
  ownerName?: string
}

export function InsuranceInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
  recipientType,
  ownerName,
}: InsuranceInfoRequestEmailProps) {
  const preview = `Confirm insurance details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>Confirm insurance details</EmailHeading>

      {recipientType === "broker" ? (
        <>
          <EmailParagraph>
            {branding.orgName} is setting up{" "}
            <Strong>{propertyLabel}</Strong>
            {ownerName ? (
              <>
                {" "}for your client <Strong>{ownerName}</Strong>
              </>
            ) : null}{" "}
            on their property management platform, and would appreciate
            your help confirming the current coverage on file.
          </EmailParagraph>
          <EmailParagraph>
            A secure form is ready below — it should take a couple of
            minutes to complete:
          </EmailParagraph>
        </>
      ) : (
        <>
          <EmailParagraph>
            {branding.orgName} is setting up{" "}
            <Strong>{propertyLabel}</Strong> on their property management
            platform, and needs to confirm the current insurance on the
            property.
          </EmailParagraph>
          <EmailParagraph>
            Having this on record helps with claims, broker notifications
            when incidents happen, and annual renewal reminders. It should
            take about two minutes:
          </EmailParagraph>
        </>
      )}

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        Open the form
      </EmailButton>

      <RequestList
        items={[
          "Insurer name",
          "Policy number",
          "Annual renewal date",
          "Replacement value on the current policy",
          ...(recipientType === "broker"
            ? ["Your preferred contact details for incident notifications"]
            : ["Broker name and contact, if you use one"]),
        ]}
      />

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
