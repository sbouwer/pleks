/**
 * lib/comms/templates/tenant/leases/demand-to-vacate-expiry.tsx — Notice 2: Demand to Vacate (expiry)
 *
 * Data:   tenant, domicilium service address, property, lease end date, org branding
 * Notes:  LEG-NOTICES-01 / R7.3 Notice 2 (fixed-term expiry). ⚠ Rule 5 precondition (slice E): where the
 *         CPA governs, may only issue if the s14(2)(b)(ii) expiry notification is recorded AND the tenancy
 *         did not continue month-to-month under s14(2)(d) — a continued tenancy routes to Notice 3. Verbatim
 *         R7.3 copy; renders behind the 'draft' gate until counsel Part F sign-off. Citation branches on the
 *         3-state cpaApplies.
 */

import * as React from "react"
import { Text } from "@react-email/components"
import { LegalFooter } from "../../LegalFooter"
import { demandVacateExpiryBasis, type CpaAppliesState } from "../../legalCitations"
import type { OrgBranding } from "../../layout"
import {
  DemandToVacateChrome, VacateParagraph, InspectionParagraph, ExpiryReservationParagraph,
  HoldingOverPieParagraph, LegalAdviceParagraph, CitationLine, SignOff, para,
} from "./demand-to-vacate.shared"

export interface DemandToVacateExpiryEmailProps {
  branding: OrgBranding
  tenantName: string
  serviceAddress: string
  propertyLabel: string
  referenceNumber: string
  landlordOrAgentName: string
  leaseEndDate: string
  vacateByDate: string
  todaysDate: string
  /** Lease CPA-applicability snapshot (cpa_applies_at_signing). Only "yes" cites the CPA. */
  cpaApplies: CpaAppliesState
}

export function DemandToVacateExpiryEmail({
  branding, tenantName, serviceAddress, propertyLabel, referenceNumber, landlordOrAgentName,
  leaseEndDate, vacateByDate, todaysDate, cpaApplies,
}: Readonly<DemandToVacateExpiryEmailProps>) {
  return (
    <DemandToVacateChrome
      branding={branding}
      preview={`Demand to vacate following lease expiry — ${propertyLabel}`}
      today={todaysDate}
      referenceNumber={referenceNumber}
      tenantName={tenantName}
      serviceAddress={serviceAddress}
      reLine={`RE: DEMAND TO VACATE PREMISES FOLLOWING LEASE EXPIRY — ${propertyLabel}`}
      propertyLabel={propertyLabel}
    >
      <Text style={para}>
        We refer to the lease agreement for the abovementioned premises, which expired by effluxion of time
        on {leaseEndDate}. As no renewal or extension has been agreed, the landlord&apos;s position is that
        your right to occupy the premises has terminated.
      </Text>

      <VacateParagraph landlordOrAgentName={landlordOrAgentName} vacateByDate={vacateByDate} />

      <InspectionParagraph landlordOrAgentName={landlordOrAgentName} />

      <ExpiryReservationParagraph leaseEndDate={leaseEndDate} />

      <HoldingOverPieParagraph vacateByDate={vacateByDate} />

      <LegalAdviceParagraph />

      <CitationLine text={demandVacateExpiryBasis(cpaApplies)} />

      <SignOff branding={branding} />

      <LegalFooter tribunal />
    </DemandToVacateChrome>
  )
}
