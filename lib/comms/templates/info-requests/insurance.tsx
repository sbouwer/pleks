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

function InsuranceIntro({
  checklistMode,
  recipientType,
  orgName,
  propertyLabel,
  ownerName,
}: Readonly<{
  checklistMode?: boolean
  recipientType: InsuranceRecipientType
  orgName: string
  propertyLabel: string
  ownerName?: string
}>) {
  if (checklistMode) {
    return (
      <EmailParagraph>
        {orgName} needs you to confirm a few items on the insurance checklist
        for <Strong>{propertyLabel}</Strong>. Each item is a short yes / no —
        it should take about two minutes:
      </EmailParagraph>
    )
  }
  if (recipientType === "broker") {
    return (
      <>
        <EmailParagraph>
          {orgName} is setting up <Strong>{propertyLabel}</Strong>
          {ownerName ? <> for your client <Strong>{ownerName}</Strong></> : null}{" "}
          on their property management platform, and would appreciate your help
          confirming the current coverage on file.
        </EmailParagraph>
        <EmailParagraph>
          A secure form is ready below — it should take a couple of minutes to
          complete:
        </EmailParagraph>
      </>
    )
  }
  return (
    <>
      <EmailParagraph>
        {orgName} is setting up <Strong>{propertyLabel}</Strong> on their
        property management platform, and needs to confirm the current insurance
        on the property.
      </EmailParagraph>
      <EmailParagraph>
        Having this on record helps with claims, broker notifications when
        incidents happen, and annual renewal reminders. It should take about two
        minutes:
      </EmailParagraph>
    </>
  )
}

export interface InsuranceInfoRequestEmailProps {
  branding: OrgBranding
  propertyLabel: string
  secureUrl: string
  recipientType: InsuranceRecipientType
  /** If the broker knows the client by name, include it in the intro */
  ownerName?: string
  /** When true, owner is asked to verify specific checklist items, not enter policy data */
  checklistMode?: boolean
}

export function InsuranceInfoRequestEmail({
  branding,
  propertyLabel,
  secureUrl,
  recipientType,
  ownerName,
  checklistMode,
}: InsuranceInfoRequestEmailProps) {
  const preview = checklistMode
    ? `Verify insurance items for ${propertyLabel}`
    : `Confirm insurance details for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <EmailHeading>
        {checklistMode ? "Verify insurance checklist items" : "Confirm insurance details"}
      </EmailHeading>

      <InsuranceIntro
        checklistMode={checklistMode}
        recipientType={recipientType}
        orgName={branding.orgName}
        propertyLabel={propertyLabel}
        ownerName={ownerName}
      />

      <EmailButton href={secureUrl} accentColor={branding.accentColor}>
        {checklistMode ? "Open the checklist" : "Open the form"}
      </EmailButton>

      {!checklistMode && (
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
      )}

      <ExpiryLine />
      <POPIALine orgName={branding.orgName} />
      <EmailSignoff orgName={branding.orgName} />
    </EmailLayout>
  )
}
