/**
 * lib/reports/screening/_primitives/FlagBadge.tsx — Inline flag badge for FitScore Stream 2 PDFs
 *
 * Notes: Three visual classes per COMPOSITE.md §3.7.
 *        Border style (solid vs dashed) + weight is the primary discriminator — colour is secondary.
 *        Critical: solid red-border. Capping: solid grey-border. Trust: dashed green-border.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.5.
 */

import { View, Text } from "@react-pdf/renderer"
import { colors, sp } from "./theme"
import type { MaterialFlag } from "./theme"

interface Props {
  flag: MaterialFlag
  showApplicantLabel?: boolean
}

export function FlagBadge({ flag, showApplicantLabel = true }: Readonly<Props>) {
  const fc = colors.flag[flag.class] ?? colors.flag.capping
  const isDashed = flag.class === 'trust'
  const label = showApplicantLabel && flag.applicantLabel
    ? `${sp(flag.description)} — ${flag.applicantLabel}`
    : sp(flag.description)

  return (
    <View style={{
      borderLeftWidth: 2,
      borderLeftColor: fc.border,
      borderStyle: isDashed ? 'dashed' : 'solid',
      backgroundColor: fc.bg,
      paddingLeft: 5,
      paddingVertical: 2,
      paddingRight: 5,
      marginBottom: 3,
    }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica', color: colors.text.primary }}>
        {label}
      </Text>
    </View>
  )
}
