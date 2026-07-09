/**
 * lib/comms/templates/tenant/leases/demand-to-vacate-m2m.tsx — Notice 3: Demand to Vacate (month-to-month)
 *
 * Data:   tenant, domicilium service address, property, termination-notice + notice-period-end dates, branding
 * Notes:  LEG-NOTICES-01 / R7.3 Notice 3 (month-to-month termination). ⚠ Rule 6 precondition (slice E): may
 *         only issue where a prior written termination notice is recorded WITH its own service evidence and
 *         its notice period has expired. Structure is Notice 2's, with the opening + citation replaced (RHA
 *         s5(5), no CPA branch). Verbatim R7.3 copy; renders behind the 'draft' gate until counsel sign-off.
 */

import * as React from "react"
import { Text } from "@react-email/components"
import { LegalFooter } from "../../LegalFooter"
import { demandVacateM2mBasis } from "../../legalCitations"
import type { OrgBranding } from "../../layout"
import {
  DemandToVacateChrome, VacateParagraph, InspectionParagraph, ExpiryReservationParagraph,
  HoldingOverPieParagraph, LegalAdviceParagraph, CitationLine, SignOff, para,
} from "./demand-to-vacate.shared"

export interface DemandToVacateM2mEmailProps {
  branding: OrgBranding
  tenantName: string
  serviceAddress: string
  propertyLabel: string
  referenceNumber: string
  landlordOrAgentName: string
  terminationNoticeDate: string
  leaseEndDate: string          // the date the notice period expired
  vacateByDate: string
  todaysDate: string
}

export function DemandToVacateM2mEmail({
  branding, tenantName, serviceAddress, propertyLabel, referenceNumber, landlordOrAgentName,
  terminationNoticeDate, leaseEndDate, vacateByDate, todaysDate,
}: Readonly<DemandToVacateM2mEmailProps>) {
  return (
    <DemandToVacateChrome
      branding={branding}
      preview={`Demand to vacate following termination on notice — ${propertyLabel}`}
      today={todaysDate}
      referenceNumber={referenceNumber}
      tenantName={tenantName}
      serviceAddress={serviceAddress}
      reLine={`RE: DEMAND TO VACATE PREMISES FOLLOWING TERMINATION ON NOTICE — ${propertyLabel}`}
      propertyLabel={propertyLabel}
    >
      <Text style={para}>
        We refer to the month-to-month tenancy in respect of the abovementioned premises, and to the written
        notice of termination served on you on {terminationNoticeDate}. The notice period expired on{" "}
        {leaseEndDate}, and the landlord&apos;s position is that your right to occupy the premises has terminated.
      </Text>

      <VacateParagraph landlordOrAgentName={landlordOrAgentName} vacateByDate={vacateByDate} />

      <InspectionParagraph landlordOrAgentName={landlordOrAgentName} />

      <ExpiryReservationParagraph leaseEndDate={leaseEndDate} />

      <HoldingOverPieParagraph vacateByDate={vacateByDate} />

      <LegalAdviceParagraph />

      <CitationLine text={demandVacateM2mBasis()} />

      <SignOff branding={branding} />

      <LegalFooter tribunal />
    </DemandToVacateChrome>
  )
}
