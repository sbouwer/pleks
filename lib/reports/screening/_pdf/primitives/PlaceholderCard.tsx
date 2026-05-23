/**
 * lib/reports/screening/_pdf/primitives/PlaceholderCard.tsx
 *
 * Shared placeholder states for E.3 skeleton sections.
 * pending        — amber dashed border; data gated on ADDENDUM_14D.
 * not-solicited  — grey dashed; data declined or not requested by the applicant.
 * not-applicable — muted solid; section irrelevant for this applicant type.
 * notAssessed    — muted solid; insufficient evidence for this dimension (LDP).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3, §E.5.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS } from "./theme"

export type PlaceholderVariant = 'pending' | 'not-solicited' | 'not-applicable' | 'notAssessed'

const S = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderWidth:       0.75,
    borderRadius:      2,
  },
  pending: {
    borderColor:     C.amber.base,
    borderStyle:     'dashed',
    backgroundColor: C.amber.wash,
  },
  notSolicited: {
    borderColor:     C.rule.strong,
    borderStyle:     'dashed',
    backgroundColor: C.surface.paperSunk,
  },
  notApplicable: {
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperSunk,
  },
  label: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    letterSpacing: 1,
    marginBottom:  4,
  },
  labelPending:       { color: C.amber.ink },
  labelNotSolicited:  { color: C.ink.mute },
  labelNotApplicable: { color: C.ink.ghost },
  message: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    lineHeight: 1.55,
  },
  messagePending:       { color: C.ink.soft },
  messageNotSolicited:  { color: C.ink.mute },
  messageNotApplicable: { color: C.ink.faint },
})

function cardVariantStyle(v: PlaceholderVariant) {
  if (v === 'pending')       return S.pending
  if (v === 'not-solicited') return S.notSolicited
  return S.notApplicable
}
function labelVariantStyle(v: PlaceholderVariant) {
  if (v === 'pending')       return S.labelPending
  if (v === 'not-solicited') return S.labelNotSolicited
  return S.labelNotApplicable
}
function msgVariantStyle(v: PlaceholderVariant) {
  if (v === 'pending')       return S.messagePending
  if (v === 'not-solicited') return S.messageNotSolicited
  return S.messageNotApplicable
}
function variantLabel(v: PlaceholderVariant): string {
  if (v === 'pending')       return 'PENDING'
  if (v === 'not-solicited') return 'NOT SOLICITED'
  if (v === 'notAssessed')   return 'NOT ASSESSED'
  return 'NOT APPLICABLE'
}

interface PlaceholderCardProps {
  variant: PlaceholderVariant
  message: string
}

export function PlaceholderCard({ variant, message }: Readonly<PlaceholderCardProps>) {
  return (
    <View style={[S.card, cardVariantStyle(variant)]}>
      <Text style={[S.label, labelVariantStyle(variant)]}>{variantLabel(variant)}</Text>
      <Text style={[S.message, msgVariantStyle(variant)]}>{message}</Text>
    </View>
  )
}
