/**
 * lib/reports/screening/_primitives/BureauList.tsx — Inline bureau name list for FitScore Stream 2 PDFs
 *
 * Notes: Renders only responding bureaus — non-responders are omitted entirely (Decision #7).
 *        Full bureau names used per Decision #6: TransUnion, VeriCred, Sigma, XDS, CompuScan, Experian.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.8.
 */

import { Text } from "@react-pdf/renderer"
import { colors, sp } from "./theme"

interface Props {
  bureaus: string[]
  fontSize?: number
}

export function BureauList({ bureaus, fontSize = 8 }: Readonly<Props>) {
  const text = bureaus.length > 0 ? bureaus.map(sp).join(', ') : 'None'
  return (
    <Text style={{ fontSize, fontFamily: 'Helvetica', color: colors.text.soft }}>
      {text}
    </Text>
  )
}
