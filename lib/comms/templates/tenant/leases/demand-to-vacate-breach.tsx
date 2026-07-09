/**
 * lib/comms/templates/tenant/leases/demand-to-vacate-breach.tsx — Notice 1: Demand to Vacate (breach)
 *
 * Data:   tenant, domicilium service address, property, final-notice + cancellation dates, org branding
 * Notes:  LEG-NOTICES-01 / R7.3 Notice 1 (breach cancellation). This notice is the OPERATIVE cancellation
 *         instrument (Option A) — slice E sets/locks cancellationEffectiveDate at generation. Verbatim R7.3
 *         copy; renders behind the 'draft' gate (011 §25) until counsel Part F sign-off. body_full is stored
 *         verbatim as the Tribunal/court evidence record. Citation branches on the 3-state cpaApplies.
 */

import * as React from "react"
import { Text } from "@react-email/components"
import { LegalFooter } from "../../LegalFooter"
import { demandVacateBreachBasis, type CpaAppliesState } from "../../legalCitations"
import type { OrgBranding } from "../../layout"
import {
  DemandToVacateChrome, VacateParagraph, InspectionParagraph, LegalAdviceParagraph, CitationLine, SignOff, para,
} from "./demand-to-vacate.shared"

export interface DemandToVacateBreachEmailProps {
  branding: OrgBranding
  tenantName: string
  serviceAddress: string
  propertyLabel: string
  referenceNumber: string
  landlordOrAgentName: string
  finalNoticeDate: string
  cancellationEffectiveDate: string
  vacateByDate: string
  todaysDate: string
  /** Lease CPA-applicability snapshot (cpa_applies_at_signing). Only "yes" cites the CPA. */
  cpaApplies: CpaAppliesState
}

export function DemandToVacateBreachEmail({
  branding, tenantName, serviceAddress, propertyLabel, referenceNumber, landlordOrAgentName,
  finalNoticeDate, cancellationEffectiveDate, vacateByDate, todaysDate, cpaApplies,
}: Readonly<DemandToVacateBreachEmailProps>) {
  return (
    <DemandToVacateChrome
      branding={branding}
      preview={`Demand to vacate following lease cancellation — ${propertyLabel}`}
      today={todaysDate}
      referenceNumber={referenceNumber}
      tenantName={tenantName}
      serviceAddress={serviceAddress}
      reLine={`RE: DEMAND TO VACATE PREMISES FOLLOWING LEASE CANCELLATION — ${propertyLabel}`}
      propertyLabel={propertyLabel}
    >
      <Text style={para}>
        We refer to the Final Notice of Breach served on you on {finalNoticeDate}, which required you to
        remedy your breach of the lease agreement within the period stated. That period has expired without
        the breach being remedied.
      </Text>

      <Text style={para}>
        The landlord accordingly hereby cancels the lease agreement with effect from {cancellationEffectiveDate}.
      </Text>

      <VacateParagraph
        landlordOrAgentName={landlordOrAgentName}
        vacateByDate={vacateByDate}
        prefix="Following cancellation, the landlord's position is that your right to occupy the premises has terminated. "
      />

      <InspectionParagraph landlordOrAgentName={landlordOrAgentName} />

      <Text style={para}>
        Any amounts received from you after the date of cancellation are accepted strictly on account of
        amounts owing and damages for occupation, without prejudice, and do not reinstate the lease agreement
        or create any new tenancy.
      </Text>

      <Text style={para}>
        Should you fail to vacate the premises by {vacateByDate}, the landlord reserves its rights and may
        instruct its attorneys to approach the Court for an eviction order in terms of the Prevention of
        Illegal Eviction from and Unlawful Occupation of Land Act 19 of 1998 (PIE), together with such damages
        or other relief as may be recoverable in law, and an appropriate costs order.
      </Text>

      <LegalAdviceParagraph />

      <CitationLine text={demandVacateBreachBasis(cpaApplies)} />

      <SignOff branding={branding} />

      <LegalFooter tribunal />
    </DemandToVacateChrome>
  )
}
